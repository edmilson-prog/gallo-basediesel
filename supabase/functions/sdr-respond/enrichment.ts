/**
 * SDR-collected data (preferred name, location) only enriches the real
 * customer record when the field is genuinely empty — it never overwrites
 * data that already exists in the CRM. Deliberately generic (no ICustomer
 * import): the caller maps this patch onto the real customer fields.
 */
export interface ICurrentCustomerFields {
  name: string | null;
  city: string | null;
}

export interface ISdrCollectedFields {
  preferredName?: string;
  location?: string;
}

export interface ICustomerEnrichmentPatch {
  name?: string;
  city?: string;
}

export function computeCustomerEnrichmentPatch(
  current: ICurrentCustomerFields,
  collected: ISdrCollectedFields,
): ICustomerEnrichmentPatch {
  const patch: ICustomerEnrichmentPatch = {};
  if (!current.name?.trim() && collected.preferredName) {
    patch.name = collected.preferredName;
  }
  if (!current.city?.trim() && collected.location) {
    patch.city = collected.location;
  }
  return patch;
}
