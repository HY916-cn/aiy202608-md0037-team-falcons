export type LoginConfigurationIssue = 'incomplete' | 'missing' | null;

export function shouldRenderLoginForm(
  configurationIssue: LoginConfigurationIssue,
): boolean {
  return configurationIssue === null;
}
