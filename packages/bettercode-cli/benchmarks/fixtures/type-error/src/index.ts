import { greet } from "./user"

// BUG: passing a string instead of User object
const greeting = greet("Alice")

export function formatGreeting(): string {
  return greeting.toUpperCase()
}
