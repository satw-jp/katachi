// ---------------------------------------------------------------------------
// S2b's params = S1's FieldParams (field generation knobs, imported not
// copied) plus the one new knob this Study introduces: softness. Softness is
// a material-field parameter (RESEARCH.md §1 用語: 材料の場), so — like the
// other つまみ — its changes belong in the operation history (T2b-sag.md §1).
// ---------------------------------------------------------------------------

import type { FieldParams } from "../cloud-sculpt/field.ts";
import { DEFAULT_FIELD_PARAMS } from "../cloud-sculpt/field.ts";

export interface SagParams extends FieldParams {
  /** 0 = rigid (no sag, identical to S2's resting shape) .. 1 = soft (large sag). Uniform material for now (T2b-sag.md: 材料は当面一様). */
  softness: number;
}

export const DEFAULT_SAG_PARAMS: SagParams = {
  ...DEFAULT_FIELD_PARAMS,
  softness: 0,
};
