import { describe, before, it, beforeEach } from 'node:test';
import { randomUUID } from 'crypto';
import { Gatana } from '../lib/index.js';

[undefined, 'some-org'].forEach(providedOrgId => {
  describe('Gatana SDK', () => {
    const sdk = new Gatana();

    it('should create a run with agentId', async () => {
      // Arrange
      const agentId = `agent-${randomUUID()}`;

      // Act
      try {
        await sdk.query('Hello how are you?', {
          agentId,
        });
      } catch (e) {
        console.error(e);
      }
    });
  });
});
