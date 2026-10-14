import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { markUnsupportedBoundaryObject } from "../execution-context/analysis-failure";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ESObject, TESObject } from "../Object";
import { ESString } from "../string/String";
import { Any, ESNumber } from "../types";

// ECMAScript TimeClip: a Date time value is an integral millisecond count
// within +/- 8.64e15 of the epoch. Observed fractional counts truncate the
// same way new Date(milliseconds) clips.
export function validateDateMilliseconds(milliseconds: number): number {
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8.64e15) {
    throw new Error("Date observations require finite milliseconds within the ECMAScript Date range");
  }
  // TimeClip also normalizes negative zero to positive zero.
  return Math.trunc(milliseconds) + 0;
}

const dateValues = new WeakMap<object, number>();

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Howard Hinnant's proleptic Gregorian conversion, inverted: days since
// 1970-01-01 to [year, zero-based month, day of month]. Pure arithmetic over
// the integral day count; no timezone or host clock involvement.
function civilFromDays(days: number): [number, number, number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) +
    Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  return [month <= 2 ? year + 1 : year, month - 1, day];
}

// Date.prototype.toUTCString as implemented by the pinned host, e.g.
// "Thu, 01 Jan 1970 00:00:00 GMT": four-digit padded years inside 0000-9999
// (negative ones signed, "-0001"), plain natural years outside. Deterministic
// UTC only.
export function utcDateString(milliseconds: number): string {
  const day = Math.floor(milliseconds / 86400000);
  const time = ((milliseconds % 86400000) + 86400000) % 86400000;
  const weekday = WEEKDAYS[(((day + 4) % 7) + 7) % 7];
  const [year, month, date] = civilFromDays(day);
  const pad = (value: number) => String(value).padStart(2, "0");
  const years = Math.abs(year) <= 9999 ? (year < 0 ? "-" : "") + String(Math.abs(year)).padStart(4, "0")
    : String(year);
  return `${weekday}, ${pad(date)} ${MONTHS[month]} ${years} ` +
    `${pad(Math.floor(time / 3600000))}:${pad(Math.floor(time / 60000) % 60)}:${pad(Math.floor(time / 1000) % 60)} GMT`;
}

function unsupported(detail: string): never {
  throw new Error(`Date analysis is not yet supported: ${detail}`);
}

function operation(name: string, length: number, model: HostModel, publicName = name) {
  const method = Object.assign(createHostFunction(`Date.prototype.${name}`, model), {
    nonConstructible: false,
    unmodeledConstruct: `Date.prototype.${name} construction is not yet supported`,
    unknownProperties: `Date.prototype.${name} function API`, modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: `Date.prototype.${name} descriptors`,
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  Object.assign(method.properties, { name: ESString(publicName), length: ESNumber(length) });
  return method;
}

// A bounded Date method reads only the declared time value of a bounded Date
// instance. Borrowed receivers stay a host guard, never a silent zero.
function dateMethod(name: string, produce: (milliseconds: number) => Any) {
  return operation(name, 0, (call: any, context: TExecutionContext): BranchResult =>
    withValue(call.receiver, context, (receiver, branch) => {
      const milliseconds = dateValues.get(receiver as object);
      if (milliseconds === undefined) return unsupported("Date methods borrowed by an unmodeled receiver");
      return [produce(milliseconds), branch];
    }));
}

let datePrototype: TESObject | undefined;

function getDatePrototype(): TESObject {
  if (!datePrototype) {
    datePrototype = Object.assign(ESObject(), {
      unknownProperties: "Date prototype API",
      unmodeledOwnPropertyInspection: "Date prototype descriptors"
    });
    datePrototype.properties.getTime = dateMethod("getTime", milliseconds => ESNumber(milliseconds));
    datePrototype.properties.toUTCString = dateMethod("toUTCString", milliseconds => ESString(utcDateString(milliseconds)));
  }
  return datePrototype;
}

/** A bounded Date instance carrying one declared integral time value. */
export function boundedDate(milliseconds: number): TESObject {
  // Marked so reached unmodeled Date fields stop as retained typed boundaries
  // beside their siblings, never as host failures losing state.
  const result = markUnsupportedBoundaryObject(Object.assign(ESObject(), {
    prototype: getDatePrototype(),
    unknownProperties: "Date instance fields",
    modeledInheritedProperties: ["getTime", "toUTCString"],
    unmodeledOwnPropertyInspection: "Date instance descriptors",
    unmodeledPropertyWrites: ["__proto__"]
  }));
  dateValues.set(result, milliseconds);
  return result;
}
