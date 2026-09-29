import { WithProperties, Any, WithValue, Type, ValueIdentifier } from "./types";

export type TESObject = Type<"object"> &
  WithProperties &
  WithValue<{ [key: string]: Any }> & {
    type: "object";
  };

export function ESObject(
  value?: { [key: string]: Any }, ownPropertyModel: WithProperties["ownPropertyModel"] = "enumerable-data"
): TESObject {
  return {
    type: "object",
    id: ValueIdentifier(),
    properties: value || {},
    ownPropertyModel,
    value
  };
}

export function isESObject(arg: any): arg is TESObject {
  return arg.type === "object";
}
