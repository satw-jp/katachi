import assert from "node:assert/strict";
import test from "node:test";
import { CONCEPT_DEFINITIONS, CONCEPT_IDS } from "../conceptRegistry.ts";
import { defaultParameters, validateParameterValue } from "../parameterStore.ts";

test("V4 registry contains exactly ten unique concepts with valid defaults", () => {
  assert.equal(CONCEPT_DEFINITIONS.length, 10);
  assert.equal(new Set(CONCEPT_IDS).size, 10);
  for (const definition of CONCEPT_DEFINITIONS) {
    assert.ok(definition.id && definition.title && definition.statement);
    assert.ok(definition.parameters.length >= 4);
    const values = defaultParameters(definition.parameters);
    for (const parameter of definition.parameters) assert.equal(validateParameterValue(parameter, values[parameter.id]!), true, parameter.id);
  }
});
