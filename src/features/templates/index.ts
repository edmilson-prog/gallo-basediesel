/**
 * GALLO BASE DIESEL — HSM templates feature (PRD-116).
 * Catalog management screen, template picker and render engine.
 */

export { TemplatesSettingsPage } from "./pages/TemplatesSettingsPage";
export {
  TemplatePicker,
  type ITemplatePickerSelection,
  type ITemplatePickerProps,
} from "./components/TemplatePicker";
export {
  renderTemplate,
  countTemplateVariables,
  TemplateRenderError,
  type IRenderedTemplate,
  type IMetaTemplateComponent,
} from "./engine/render";
