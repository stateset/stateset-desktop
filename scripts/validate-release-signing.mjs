#!/usr/bin/env node
import { validateSigningConfiguration } from './release-source.mjs';

try {
  validateSigningConfiguration(process.env);
  console.log(
    'Required signing settings are present. Platform builds will verify certificates, signatures and notarization.'
  );
} catch (error) {
  console.error(`Release signing configuration failed: ${error.message}`);
  process.exitCode = 1;
}
