import assert from "node:assert/strict";
import test from "node:test";
import { ParameterStore, defaultParameters, validateParameterValue } from "../parameterStore.ts";
import { CONCEPT_DEFINITIONS } from "../conceptRegistry.ts";

test("parameter store accepts defaults and rejects values outside schema", () => {
  for (const definition of CONCEPT_DEFINITIONS) {
    const store = new ParameterStore(definition.parameters);
    assert.deepEqual(store.snapshot(), defaultParameters(definition.parameters));
    for (const parameter of definition.parameters) {
      const value = parameter.defaultValue;
      assert.equal(validateParameterValue(parameter, value), true);
      if (parameter.kind === "range") assert.equal(store.set(parameter.id, (parameter.max ?? 1) + 1), false);
    }
  }
});
