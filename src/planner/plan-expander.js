const fs = require("fs");
const path = require("path");
const { ensureDir, writeJson, writeText } = require("../tools/files");

function expandProjectPlan({ cwd, planFile }) {
  if (!planFile) {
    throw new Error("Missing project plan path. Example: vibe expand-plan .vibe/project-plans/<id>/project-plan.json");
  }

  const fullPath = path.resolve(cwd, planFile);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Project plan not found: ${fullPath}`);
  }

  const plan = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const expansionId = createExpansionId();
  const outputDir = path.join(cwd, ".vibe", "project-tasks", expansionId);
  const modulesDir = path.join(outputDir, "modules");
  ensureDir(modulesDir);

  const moduleTasks = plan.modules.map((item, index) => createModuleTask({ plan, module: item, index }));
  for (const task of moduleTasks) {
    writeJson(path.join(modulesDir, `${task.order}-${task.moduleId}.json`), task);
    writeText(path.join(modulesDir, `${task.order}-${task.moduleId}.txt`), task.requirement);
  }

  const batch = {
    sourceProjectPlan: path.relative(cwd, fullPath),
    project: plan.project,
    tasks: moduleTasks.map((task) => ({
      requirement: task.requirement,
      moduleId: task.moduleId,
      order: task.order
    }))
  };

  const summary = {
    expansionId,
    sourceProjectPlan: path.relative(cwd, fullPath),
    outputDir: path.relative(cwd, outputDir),
    modules: moduleTasks.map((task) => ({
      order: task.order,
      moduleId: task.moduleId,
      name: task.name,
      file: path.join("modules", `${task.order}-${task.moduleId}.json`)
    })),
    nextCommands: [
      `node src/cli.js batch ${path.relative(cwd, path.join(outputDir, "batch.json"))} --yes --dry-run`,
      `node src/cli.js batch ${path.relative(cwd, path.join(outputDir, "batch.json"))} --llm deepseek --yes --continue-on-failure`
    ]
  };

  writeJson(path.join(outputDir, "batch.json"), batch);
  writeJson(path.join(outputDir, "summary.json"), summary);
  writeText(path.join(outputDir, "README.md"), createExpansionReport({ plan, moduleTasks, summary }));

  return {
    expansionId,
    outputDir,
    batchPath: path.join(outputDir, "batch.json"),
    summaryPath: path.join(outputDir, "summary.json"),
    reportPath: path.join(outputDir, "README.md"),
    moduleTasks
  };
}

function createModuleTask({ plan, module, index }) {
  const order = String(index + 1).padStart(2, "0");
  const relatedTables = relatedDataModel(plan.dataModel, module.id);
  const apiContracts = (plan.apiContracts || []).filter((item) => item.module === module.id);
  const batch = (plan.deliveryBatches || []).find((item) => (item.modules || []).includes(module.id));

  const requirement = [
    `Implement module: ${module.name}`,
    "",
    `Project: ${plan.project.name}`,
    `Project type: ${plan.project.type}`,
    `Recommended stack: ${plan.project.recommendedStack}`,
    `Architecture: ${plan.project.architecture}`,
    batch ? `Delivery batch: ${batch.batch} ${batch.name}` : "",
    "",
    "Module capabilities:",
    ...module.capabilities.map((item) => `- ${item}`),
    "",
    "Related data model draft:",
    ...(relatedTables.length ? relatedTables.map((item) => `- ${item}`) : ["- Define module-specific tables if needed."]),
    "",
    "API contract draft:",
    ...(apiContracts.length ? apiContracts.flatMap((contract) => contract.endpoints.map((endpoint) => `- ${endpoint}`)) : ["- Define module-specific endpoints."]),
    "",
    "Acceptance criteria:",
    "- Implement only this module's minimal vertical slice.",
    "- Keep module boundaries explicit.",
    "- Include smoke tests or contract checks.",
    "- Record risks and follow-up work.",
    "",
    "Important constraints:",
    "- Do not attempt to build the entire ERP in this module task.",
    "- Prefer simple contracts and clear data ownership over broad abstractions.",
    "- Human approval is required before changing global architecture or database conventions."
  ].filter(Boolean).join("\n");

  return {
    order,
    moduleId: module.id,
    name: module.name,
    capabilities: module.capabilities,
    relatedTables,
    apiContracts,
    deliveryBatch: batch || null,
    requirement
  };
}

function relatedDataModel(tables, moduleId) {
  const keywords = {
    foundation: ["audit"],
    "auth-rbac": ["user", "role", "permission"],
    auth: ["user", "role", "permission"],
    organization: ["organization", "department", "employee"],
    "master-data": ["customer", "supplier", "product", "warehouse", "unit"],
    procurement: ["purchase", "receipt", "supplier"],
    sales: ["sales", "shipment", "customer"],
    inventory: ["inventory", "stock", "warehouse"],
    finance: ["receivable", "payable", "payment"],
    reports: ["report", "sales", "purchase", "inventory", "finance"],
    reporting: ["report"]
  }[moduleId] || [moduleId];

  return (tables || []).filter((table) => keywords.some((keyword) => table.includes(keyword)));
}

function createExpansionReport({ plan, moduleTasks, summary }) {
  return [
    "# Vibe Project Task Expansion",
    "",
    `Project: ${plan.project.name}`,
    `Source plan: ${summary.sourceProjectPlan}`,
    `Modules: ${moduleTasks.length}`,
    "",
    "## Module Tasks",
    ...moduleTasks.map((task) => [
      `### ${task.order}. ${task.name}`,
      `- ID: ${task.moduleId}`,
      `- Tables: ${task.relatedTables.length ? task.relatedTables.join(", ") : "TBD"}`,
      `- Batch: ${task.deliveryBatch ? `${task.deliveryBatch.batch} ${task.deliveryBatch.name}` : "TBD"}`
    ].join("\n")),
    "",
    "## Next Commands",
    ...summary.nextCommands.map((command) => `- ${command}`)
  ].join("\n");
}

function createExpansionId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "").replace("Z", "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `project-tasks-${stamp}-${suffix}`;
}

module.exports = { expandProjectPlan };
