import { z } from "zod";

// Validation must not probe Function/eval under production's nonce-only CSP.
// Zod's interpreted validator retains the same schema validation behavior.
z.config({ jitless: true });

export { z };
