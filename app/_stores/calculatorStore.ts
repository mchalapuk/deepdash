import { proxy } from "valtio";

export const calculatorStore = proxy({
  expression: "",
  lastNormalized: "",
  lastResult: "",
});
