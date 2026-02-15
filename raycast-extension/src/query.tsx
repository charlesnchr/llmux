import { Form, ActionPanel, Action, showToast, Toast, popToRoot, open } from "@raycast/api";

interface FormValues {
  query: string;
}

export default function Command() {
  async function handleSubmit(values: FormValues) {
    const encoded = encodeURIComponent(values.query);
    await open(`llmux://query?text=${encoded}`);
    await showToast({ style: Toast.Style.Success, title: "Sent to LLMux" });
    await popToRoot();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send to LLMux" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea id="query" title="Query" placeholder="What would you like to ask?" />
    </Form>
  );
}
