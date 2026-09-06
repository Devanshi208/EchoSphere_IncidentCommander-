// Placeholder for your ONE real tool integration (section 14 of the brief:
// pick Jira OR Slack OR PagerDuty — not all three). Keep this function's
// signature the same and just replace the inside with a real fetch() call
// once you've picked one and have API creds.
export async function runTool(actionDescription: string): Promise<string> {
  // Example shape for a real Jira call, for when you're ready:
  //
  // const res = await fetch(`${process.env.JIRA_BASE_URL}/rest/api/3/issue`, {
  //   method: "POST",
  //   headers: {
  //     "content-type": "application/json",
  //     authorization: `Basic ${Buffer.from(
  //       `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  //     ).toString("base64")}`,
  //   },
  //   body: JSON.stringify({
  //     fields: {
  //       project: { key: process.env.JIRA_PROJECT_KEY },
  //       summary: actionDescription,
  //       issuetype: { name: "Task" },
  //     },
  //   }),
  // });
  // const data = await res.json();
  // return `Created ${data.key}`;

  await new Promise((r) => setTimeout(r, 400)); // simulate network latency
  return `Ticket created for: "${actionDescription}"`;
}
