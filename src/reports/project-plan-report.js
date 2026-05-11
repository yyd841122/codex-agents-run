function createProjectPlanReport(plan) {
  return [
    "# Vibe Project Plan",
    "",
    "## Requirement",
    plan.requirement,
    "",
    "## Project",
    `- Name: ${plan.project.name}`,
    `- Type: ${plan.project.type}`,
    `- Recommended stack: ${plan.project.recommendedStack}`,
    `- Architecture: ${plan.project.architecture}`,
    "",
    "## Agents",
    ...plan.agents.map((agent) => `- ${agent.name}: ${agent.responsibility}`),
    "",
    "## Phases",
    ...plan.phases.map((phase) => [
      `### ${phase.order}. ${phase.name}`,
      ...phase.outputs.map((item) => `- ${item}`)
    ].join("\n")),
    "",
    "## Modules",
    ...plan.modules.map((module) => [
      `### ${module.name}`,
      `- ID: ${module.id}`,
      ...module.capabilities.map((item) => `- ${item}`)
    ].join("\n")),
    "",
    "## Data Model Draft",
    ...plan.dataModel.map((table) => `- ${table}`),
    "",
    "## API Contract Draft",
    ...plan.apiContracts.map((contract) => [
      `### ${contract.module}`,
      ...contract.endpoints.map((endpoint) => `- ${endpoint}`),
      `- Policy: ${contract.requiredPolicy}`
    ].join("\n")),
    "",
    "## Delivery Batches",
    ...plan.deliveryBatches.map((batch) => `- Batch ${batch.batch} ${batch.name}: ${batch.modules.join(", ")}`),
    "",
    "## Acceptance",
    ...plan.acceptance.map((item) => `- ${item}`),
    "",
    "## Risks",
    ...plan.risks.map((item) => `- ${item}`),
    "",
    "## Next Step",
    plan.nextStep
  ].join("\n");
}

module.exports = { createProjectPlanReport };
