/** Workflow progress shown above the chat transcript. */
export type BackgroundJob = {
  key: string;
  workflowName: string;
  instanceId: string;
  label: string;
  stepLabel: string;
  detail: string;
  percent: number;
};
