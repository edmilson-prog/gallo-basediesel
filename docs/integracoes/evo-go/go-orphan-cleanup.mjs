// Evolution Go — limpeza de instâncias órfãs.
//
// Contexto: até o fix do PR #177, excluir uma conta Go pela plataforma removia a
// linha do banco mas NÃO apagava a instância no servidor evo-go (DELETE
// /instance/delete/{id} era chamado com o token de instância e dava 401). As
// instâncias que ficaram penduradas no servidor antes do fix precisam desta
// limpeza manual pontual.
//
// Dry-run (só lista o que está no servidor Go):
//   GO_BASE="https://evogo.ailainteligente.com" GO_KEY="<chave-global>" bun go-orphan-cleanup.mjs
// Apaga TODAS as listadas:
//   GO_BASE="https://evogo.ailainteligente.com" GO_KEY="<chave-global>" CONFIRM=1 bun go-orphan-cleanup.mjs
//
// A chave global é a AUTHENTICATION_API_KEY do servidor evo-go (a mesma que você
// digita ao adicionar um número Go). Rode no seu terminal — a chave nunca sai
// da sua máquina.

const base = (process.env.GO_BASE ?? "").replace(/\/+$/, "");
const key = process.env.GO_KEY ?? "";
const confirm = process.env.CONFIRM === "1";

if (!base || !key) {
  console.error("Defina GO_BASE e GO_KEY no ambiente. Veja o cabeçalho do arquivo.");
  process.exit(1);
}

const headers = { apikey: key, "Content-Type": "application/json" };

const res = await fetch(`${base}/instance/all`, { headers });
const text = await res.text();
if (!res.ok) {
  console.error(`GET /instance/all -> HTTP ${res.status}\n${text}`);
  process.exit(1);
}

let body;
try {
  body = JSON.parse(text);
} catch {
  console.error("Resposta nao-JSON de /instance/all:\n" + text);
  process.exit(1);
}

const list = Array.isArray(body) ? body : (body.data ?? body.instances ?? []);
console.log(`Encontradas ${list.length} instancia(s) em ${base}:\n`);
console.log(JSON.stringify(body, null, 2));

const idOf = (it) => it.id ?? it.Id ?? it.instanceId ?? it.InstanceId ?? it.name ?? it.Name;

if (!confirm) {
  console.log("\n(dry-run) Reveja a lista acima. Para apagar TODAS, re-rode com CONFIRM=1.");
  process.exit(0);
}

console.log("\nApagando...\n");
for (const it of list) {
  const id = idOf(it);
  if (!id) {
    console.log(`- (sem id reconhecivel) ${JSON.stringify(it)}`);
    continue;
  }
  const d = await fetch(`${base}/instance/delete/${id}`, { method: "DELETE", headers });
  const dt = await d.text();
  console.log(`DELETE ${id} -> HTTP ${d.status} ${d.ok ? "OK" : dt}`);
}
console.log("\nConcluido.");
