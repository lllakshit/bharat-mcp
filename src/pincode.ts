import { loadData } from "./data/loader.js"
import { statesFile } from "./data/states.js"

type PincodeFile = {
  _meta: { as_of: string; source: string; licence: string; count: number }
  records: Record<string, { state: string; district: string; circle: string; offices: string[]; delivery: boolean }>
}

const file = () => loadData<PincodeFile>("pincodes.json")

export type PincodeResult =
  | { found: true; pincode: string; state: string; district: string; postal_circle: string; post_offices: string[]; has_delivery_office: boolean; postal_zone: string; data_as_of: string; source: string; note: string }
  | { found: false; pincode: string; valid_format: boolean; reason: string; postal_zone?: string; data_as_of: string }

export function lookupPincode(input: string): PincodeResult {
  const pincode = input.replace(/\s+/g, "")
  const data = file()
  const asOf = data._meta.as_of
  if (!/^[1-9][0-9]{5}$/.test(pincode)) {
    return { found: false, pincode, valid_format: false, reason: "A pincode has 6 digits and never starts with 0.", data_as_of: asOf }
  }
  const zone = statesFile().postal_zones[pincode[0]!]
  const record = data.records[pincode]
  if (!record) {
    return {
      found: false,
      pincode,
      valid_format: true,
      reason: `Not in the bundled directory (data as of ${asOf}). It may be newer than the data, or not assigned.`,
      postal_zone: zone,
      data_as_of: asOf,
    }
  }
  return {
    found: true,
    pincode,
    state: record.state,
    district: record.district,
    postal_circle: record.circle,
    post_offices: record.offices,
    has_delivery_office: record.delivery,
    postal_zone: zone ?? "",
    data_as_of: asOf,
    source: data._meta.source,
    note: "State and district follow the names in the 2019 directory, mapped to today's state names. District names may have changed since.",
  }
}

export const pincodeMeta = () => file()._meta
