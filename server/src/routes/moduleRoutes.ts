import { ModuleKey } from '@retailsync/shared';
import { Router } from 'express';
import { moduleShellHandler } from '../controllers/moduleController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

const registerModuleCrud = (moduleName: ModuleKey) => {
  router.get(`/${moduleName}`, requireAuth, requirePermission(moduleName, 'view'), moduleShellHandler(moduleName, 'view'));
  router.post(`/${moduleName}`, requireAuth, requirePermission(moduleName, 'create'), moduleShellHandler(moduleName, 'create'));
  router.put(`/${moduleName}/:id`, requireAuth, requirePermission(moduleName, 'edit'), moduleShellHandler(moduleName, 'edit'));
  router.delete(`/${moduleName}/:id`, requireAuth, requirePermission(moduleName, 'delete'), moduleShellHandler(moduleName, 'delete'));
};

registerModuleCrud('inventory');
registerModuleCrud('invoices');
registerModuleCrud('pos');
registerModuleCrud('items');
registerModuleCrud('bankStatements');
registerModuleCrud('reconciliation');
registerModuleCrud('locations');
registerModuleCrud('suppliers');
registerModuleCrud('reports');
registerModuleCrud('dashboard');

export default router;
