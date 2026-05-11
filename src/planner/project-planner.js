const path = require("path");

function createProjectPlan({ requirement }) {
  const normalized = requirement.toLowerCase();
  const isErp = /erp|enterprise resource|进销存|库存|采购|销售|财务|权限|组织/.test(normalized);
  const project = isErp ? erpProject() : genericProject();

  return {
    version: "0.1",
    requirement,
    project,
    agents: agents(),
    phases: phases(project),
    modules: project.modules,
    dataModel: dataModel(project),
    apiContracts: apiContracts(project),
    deliveryBatches: deliveryBatches(project),
    acceptance: acceptance(project),
    risks: risks(project),
    nextStep: "Review and approve this project plan before generating implementation tasks."
  };
}

function erpProject() {
  return {
    type: "enterprise-erp",
    name: "ERP System",
    recommendedStack: "TypeScript, Node.js/NestJS or Express, React, PostgreSQL, Prisma, Playwright",
    architecture: "Modular monolith first; split services only after module boundaries stabilize.",
    modules: [
      projectModule("foundation", "System Foundation", ["Project scaffold", "Environment config", "Audit logging", "Global error handling"]),
      projectModule("auth-rbac", "Authentication and RBAC", ["Login", "User management", "Roles", "Permissions", "Session handling"]),
      projectModule("organization", "Organization Management", ["Companies", "Departments", "Employees", "Position mapping"]),
      projectModule("master-data", "Master Data", ["Customers", "Suppliers", "Products", "Warehouses", "Units"]),
      projectModule("procurement", "Procurement", ["Purchase request", "Purchase order", "Receiving", "Supplier settlement"]),
      projectModule("sales", "Sales", ["Quotation", "Sales order", "Shipment", "Customer settlement"]),
      projectModule("inventory", "Inventory", ["Stock in/out", "Transfers", "Adjustments", "Stock ledger"]),
      projectModule("finance", "Finance", ["Receivables", "Payables", "Payment records", "Invoice references"]),
      projectModule("reports", "Reports", ["Inventory report", "Sales report", "Purchase report", "Finance summary"])
    ]
  };
}

function genericProject() {
  return {
    type: "large-web-app",
    name: "Large Web Application",
    recommendedStack: "TypeScript, Node.js, React, PostgreSQL, Playwright",
    architecture: "Modular application with explicit contracts before implementation.",
    modules: [
      projectModule("foundation", "System Foundation", ["Project scaffold", "Config", "Logging"]),
      projectModule("auth", "Authentication", ["Login", "Users", "Roles"]),
      projectModule("core", "Core Domain", ["Primary entities", "Primary workflows"]),
      projectModule("reporting", "Reporting", ["Dashboards", "Exports"])
    ]
  };
}

function projectModule(id, name, capabilities) {
  return { id, name, capabilities };
}

function agents() {
  return [
    { name: "product", responsibility: "Clarify business workflows, roles, and acceptance criteria." },
    { name: "architect", responsibility: "Define architecture, module boundaries, and technical standards." },
    { name: "database", responsibility: "Design schema, migrations, indexes, and seed data." },
    { name: "backend", responsibility: "Implement APIs, services, permissions, and integrations." },
    { name: "frontend", responsibility: "Implement routes, pages, forms, tables, and state handling." },
    { name: "tester", responsibility: "Create unit, integration, and E2E test plans." },
    { name: "security", responsibility: "Review auth, authorization, tenancy, audit, and data safety." },
    { name: "reviewer", responsibility: "Review code, architecture, contracts, and acceptance coverage." },
    { name: "release", responsibility: "Prepare checkpoints, release notes, and deployment records." }
  ];
}

function phases(project) {
  return [
    phase(1, "Discovery Freeze", ["Confirm roles", "Confirm core workflows", "Confirm acceptance criteria"]),
    phase(2, "Architecture Freeze", ["Choose stack", "Define module boundaries", "Define folder structure"]),
    phase(3, "Data Contract Freeze", ["Draft ERD", "Define migrations", "Define seed data"]),
    phase(4, "API Contract Freeze", ["Define REST endpoints", "Define auth rules", "Define error format"]),
    phase(5, "Foundation Implementation", ["Scaffold app", "Auth/RBAC", "Shared UI and layout"]),
    phase(6, "Module Implementation", project.modules.map((item) => `Implement ${item.name}`)),
    phase(7, "Integration and Hardening", ["Cross-module workflows", "Security review", "E2E tests"]),
    phase(8, "Acceptance and Release", ["User acceptance report", "Git checkpoint", "Release notes"])
  ];
}

function phase(order, name, outputs) {
  return { order, name, outputs };
}

function dataModel(project) {
  const common = [
    "users", "roles", "permissions", "role_permissions", "user_roles", "audit_logs"
  ];
  if (project.type !== "enterprise-erp") return common;
  return [
    ...common,
    "organizations", "departments", "employees",
    "customers", "suppliers", "products", "warehouses", "inventory_items",
    "purchase_orders", "purchase_order_items", "receipts",
    "sales_orders", "sales_order_items", "shipments",
    "stock_movements", "stock_adjustments",
    "receivables", "payables", "payments"
  ];
}

function apiContracts(project) {
  return project.modules.map((item) => ({
    module: item.id,
    endpoints: [
      `GET /api/${item.id}`,
      `POST /api/${item.id}`,
      `GET /api/${item.id}/:id`,
      `PATCH /api/${item.id}/:id`
    ],
    requiredPolicy: "Every endpoint must declare auth, permission, validation, and audit behavior."
  }));
}

function deliveryBatches(project) {
  return [
    { batch: 1, name: "Foundation", modules: ["foundation", "auth-rbac", "auth"].filter((id) => project.modules.some((item) => item.id === id)) },
    { batch: 2, name: "Master Data", modules: project.modules.filter((item) => ["organization", "master-data"].includes(item.id)).map((item) => item.id) },
    { batch: 3, name: "Core Transactions", modules: project.modules.filter((item) => ["procurement", "sales", "inventory"].includes(item.id)).map((item) => item.id) },
    { batch: 4, name: "Finance and Reports", modules: project.modules.filter((item) => ["finance", "reports", "reporting"].includes(item.id)).map((item) => item.id) }
  ].filter((item) => item.modules.length);
}

function acceptance(project) {
  return [
    "Every module has clear user roles and acceptance criteria.",
    "Database schema and API contracts are approved before implementation.",
    "Every protected action is covered by permission checks and audit logs.",
    "Core workflows have integration or E2E tests.",
    `${project.name} can be delivered in batches with user acceptance after each batch.`
  ];
}

function risks(project) {
  return [
    "Large ERP scope must not be implemented in one generation pass.",
    "Data model changes after implementation can cause expensive rework.",
    "Permission and audit requirements need explicit approval before coding.",
    "Financial and inventory logic require domain validation by a human reviewer.",
    `Recommended architecture for MVP: ${project.architecture}`
  ];
}

function createProjectPlanId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "").replace("Z", "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `project-plan-${stamp}-${suffix}`;
}

function projectPlanPaths(cwd, planId) {
  const dir = path.join(cwd, ".vibe", "project-plans", planId);
  return {
    dir,
    json: path.join(dir, "project-plan.json"),
    report: path.join(dir, "project-plan.md")
  };
}

module.exports = { createProjectPlan, createProjectPlanId, projectPlanPaths };
