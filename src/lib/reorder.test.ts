import { describe, expect, it } from "vitest";
import { move } from "@/lib/reorder";

describe("move", () => {
  it("moves an item up", () => {
    expect(move(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("moves an item down", () => {
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op (same reference) at the top boundary", () => {
    const arr = ["a", "b", "c"];
    expect(move(arr, 0, -1)).toBe(arr);
  });

  it("is a no-op (same reference) at the bottom boundary", () => {
    const arr = ["a", "b", "c"];
    expect(move(arr, 2, 1)).toBe(arr);
  });

  it("is a no-op for an out-of-range index", () => {
    const arr = ["a", "b"];
    expect(move(arr, 5, -1)).toBe(arr);
  });

  it("does not mutate the input", () => {
    const arr = ["a", "b", "c"];
    move(arr, 1, 1);
    expect(arr).toEqual(["a", "b", "c"]);
  });
});
