/**
 * The module options interface used to live here as a plain interface.
 * It has been replaced by the class-validator DTO exported from
 * `src/config/module-options.ts`. This file is kept as a shim so that
 * deep imports of the old path continue to resolve.
 */
export { LangChainToolsModuleOptions } from '../config/module-options';
