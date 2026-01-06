/**
 * Bottles Validation Tests
 * These tests verify schema validation and business logic
 * Can be run with: npm test (requires jest/vitest to be configured)
 */

import { createBottleSchema, updateBottleSchema, bottleSchema } from "../schemas/bottles.js";
import { ZodError } from "zod";

// Test helper
function expectThrow(fn: () => void, shouldThrow = true): boolean {
  try {
    fn();
    return !shouldThrow;
  } catch (err) {
    return shouldThrow && err instanceof ZodError;
  }
}

export function runBottlesSchemaTests() {
  console.log("=== Running Bottles Schema Tests ===\n");

  // Test 1: Valid wine bottle
  console.log("Test 1: Valid wine bottle");
  const validWine = {
    category: "wine" as const,
    producer: "Château Lafite",
    name: "Lafite",
    vintageOrNone: "2015",
    cellarId: "cellar-1",
  };
  console.log(
    expectThrow(() => createBottleSchema.parse(validWine), false)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 2: Wine without producer
  console.log("\nTest 2: Wine without producer (should fail)");
  const invalidWine = {
    category: "wine" as const,
    name: "Lafite",
    vintageOrNone: "2015",
    cellarId: "cellar-1",
  };
  console.log(
    expectThrow(() => createBottleSchema.parse(invalidWine), true)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 3: Spirit with valid ABV (40)
  console.log("\nTest 3: Spirit with valid ABV (40)");
  const validSpirit = {
    category: "spirit" as const,
    distillery: "The Glenlivet",
    nameEdition: "12 Years",
    abv: 40,
    cellarId: "cellar-1",
  };
  console.log(
    expectThrow(() => createBottleSchema.parse(validSpirit), false)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 4: Spirit with ABV below range (15 < 20)
  console.log("\nTest 4: Spirit with ABV below 20 (should fail)");
  const invalidSpiritLowABV = {
    category: "spirit" as const,
    distillery: "The Glenlivet",
    nameEdition: "12 Years",
    abv: 15,
    cellarId: "cellar-1",
  };
  console.log(
    expectThrow(() => createBottleSchema.parse(invalidSpiritLowABV), true)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 5: Spirit with ABV above range (90 > 80)
  console.log("\nTest 5: Spirit with ABV above 80 (should fail)");
  const invalidSpiritHighABV = {
    category: "spirit" as const,
    distillery: "The Glenlivet",
    nameEdition: "12 Years",
    abv: 90,
    cellarId: "cellar-1",
  };
  console.log(
    expectThrow(() => createBottleSchema.parse(invalidSpiritHighABV), true)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 6: Update with partial fields
  console.log("\nTest 6: Update with partial fields");
  const partialUpdate = {
    id: "bottle-1",
    notes: "Updated notes",
  };
  console.log(
    expectThrow(() => updateBottleSchema.parse(partialUpdate), false)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 7: Update without id (should fail)
  console.log("\nTest 7: Update without id (should fail)");
  const invalidUpdate = {
    notes: "Updated notes",
  };
  console.log(
    expectThrow(() => updateBottleSchema.parse(invalidUpdate), true)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 8: Cigar box validation
  console.log("\nTest 8: Valid cigar box");
  const validCigar = {
    category: "cigar" as const,
    brand: "Cohiba",
    type: "Robusto",
    quantity: 25,
    cellarId: "cellar-1",
  };
  console.log(
    expectThrow(() => createBottleSchema.parse(validCigar), false)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 9: Filling level validation (must be 0-100)
  console.log("\nTest 9: Invalid fillLevel (150 > 100, should fail)");
  const invalidFillLevel = {
    category: "wine" as const,
    producer: "Test",
    name: "Test",
    vintageOrNone: "2015",
    cellarId: "cellar-1",
    fillLevel: 150,
  };
  console.log(
    expectThrow(() => createBottleSchema.parse(invalidFillLevel), true)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  // Test 10: Valid fillLevel (75)
  console.log("\nTest 10: Valid fillLevel (75)");
  const validFillLevel = {
    category: "wine" as const,
    producer: "Test",
    name: "Test",
    vintageOrNone: "2015",
    cellarId: "cellar-1",
    fillLevel: 75,
  };
  console.log(
    expectThrow(() => createBottleSchema.parse(validFillLevel), false)
      ? "✓ PASS"
      : "✗ FAIL"
  );

  console.log("\n=== Tests Complete ===\n");
}

// Export for module usage
export const tests = {
  schemas: {
    createBottleSchema,
    updateBottleSchema,
    bottleSchema,
  },
  helpers: {
    expectThrow,
  },
};
