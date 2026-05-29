// src/features/coming-soon/EmailCapture.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido"),
});

type FormValues = z.infer<typeof schema>;

/** Captura de e-mail (waitlist). Submit é mock — Fase 1 sem backend. */
export function EmailCapture() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = (_values: FormValues) => {
    toast.success("Você está na lista! Avisaremos no lançamento.");
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="cs-form">
        <input
          type="email"
          placeholder="Seu melhor e-mail"
          aria-label="E-mail para a lista de espera"
          {...register("email")}
        />
        <button type="submit">Avise-me</button>
      </div>
      <p className="cs-form-error">{errors.email?.message ?? ""}</p>
    </form>
  );
}
