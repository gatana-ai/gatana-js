import { Command } from 'commander';
import { Gatana } from 'gatana-sdk';
import { output, outputError } from '../../output.js';
import { timeEnd } from 'console';

export function createAuthInfoCommand(gatana: Gatana): Command {
  return new Command('auth-info').description('Display info about the authenticated user').action(async () => {
    try {
      const { data } = await gatana.api.getAuthMe();

      const formattedData = {
        user: {
          id: data?.user.id,
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
