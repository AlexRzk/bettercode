export function add(a: number, b: number): number {
  // BUG: subtraction instead of addition
  return a - b
}

export function multiply(a: number, b: number): number {
  return a * b
}
