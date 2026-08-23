/** Persisted review data for generated elements.  The machine reference is
 * deliberately separate from the derived Japanese display label: numeric
 * element IDs are only meaningful inside one committed set/batch revision. */
export interface SurfaceElementReference {
  domain: "surface";
  setRevision: number;
  patchId: number;
}

export interface InteriorElementReference {
  domain: "interior";
  batchRevision: number;
  /** Kept as a string here so this small shared module has no Study import. */
  variant: string;
  unitId: number;
}

export type ElementReference = SurfaceElementReference | InteriorElementReference;

export interface ElementAnnotationValue {
  keep: boolean;
  weakContact: boolean;
  largeOpening: boolean;
  note: string;
}

export interface ElementAnnotation {
  reference: ElementReference;
  value: ElementAnnotationValue;
}

export const EMPTY_ANNOTATION: ElementAnnotationValue = {
  keep: false,
  weakContact: false,
  largeOpening: false,
  note: "",
};

export function normalizeAnnotation(value: Partial<ElementAnnotationValue>): ElementAnnotationValue | null {
  const normalized: ElementAnnotationValue = {
    keep: value.keep === true,
    weakContact: value.weakContact === true,
    largeOpening: value.largeOpening === true,
    note: typeof value.note === "string" ? value.note.trim() : "",
  };
  return normalized.keep || normalized.weakContact || normalized.largeOpening || normalized.note ? normalized : null;
}

export function elementReferenceKey(reference: ElementReference): string {
  return reference.domain === "surface"
    ? `surface:${reference.setRevision}:${reference.patchId}`
    : `interior:${reference.batchRevision}:${reference.variant}:${reference.unitId}`;
}

export function sameElementReference(a: ElementReference, b: ElementReference): boolean {
  return elementReferenceKey(a) === elementReferenceKey(b);
}

/** Set one saved annotation, or remove it when every review field is empty. */
export function updateAnnotation(
  annotations: ElementAnnotation[],
  reference: ElementReference,
  value: Partial<ElementAnnotationValue>,
): ElementAnnotation[] {
  const next = normalizeAnnotation(value);
  const withoutCurrent = annotations.filter((annotation) => !sameElementReference(annotation.reference, reference));
  return next ? [...withoutCurrent, { reference: { ...reference } as ElementReference, value: next }] : withoutCurrent;
}

export function annotationFor(annotations: ElementAnnotation[], reference: ElementReference): ElementAnnotationValue {
  return annotations.find((annotation) => sameElementReference(annotation.reference, reference))?.value ?? EMPTY_ANNOTATION;
}

export function pruneAnnotations(annotations: ElementAnnotation[], retain: (reference: ElementReference) => boolean): ElementAnnotation[] {
  return annotations.filter((annotation) => retain(annotation.reference));
}
