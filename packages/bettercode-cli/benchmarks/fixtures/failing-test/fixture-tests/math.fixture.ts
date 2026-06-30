import { describe, it, expect } from "bun:test"
import { add, multiply } from "../../src/math"

describe("math", () => {
  it("adds two numbers", () => {
    expect(add(2, 3)).toBe(5)
  })

  it("adds negative numbers", () => {
    expect(add(-1, -2)).toBe(-3)
  })

  it("adds zero", () => {
    expect(add(5, 0)).toBe(5)
  })

  it("multiplies two numbers", () => {
    expect(multiply(2, 3)).toBe(6)
  })

  it("multiplies by zero", () => {
    expect(multiply(5, 0)).toBe(0)
  })
})
