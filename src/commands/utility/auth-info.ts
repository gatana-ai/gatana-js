import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { output, outputError } from '../../output.js';
import { timeEnd } from 'console';

export function createAuthInfoCommand(gatana: Gatana): Command {
  return new Command('auth-info').description('Display info about the authenticated user').action(async () => {
    try {
      const { data, error } = await gatana.api.getAuthMe();

      if (error) {
        outputError(error);
        return;
      }

      const formattedData = {
        user: {
          sub: data?.user.sub,
          email: data?.user.email,
          name: data?.user.name,
        },
        org: {
          id: data?.tenant.id,
          displayName: data?.tenant.displayName,
          isTrial: data?.tenant.isTrial,
          subscriptionPlan: data?.tenant.subscriptionPlan,
        },
      };

      output(formattedData, { defaultFormat: 'yaml' });
    } catch (err) {
      outputError(err);
    }
  });
}
