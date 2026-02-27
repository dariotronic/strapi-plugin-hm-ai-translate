import { PLUGIN_ID } from './pluginId';
import { Initializer } from './components/Initializer';
import { TranslatePanel } from './components/TranslatePanel';

export default {
  register(app: any) {
    // Note: If you have a settings page, add it here via app.addMenuLink
    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  bootstrap(app: any) {
    const cmPlugin = app.getPlugin('content-manager');
    if (cmPlugin && cmPlugin.apis && typeof cmPlugin.apis.addEditViewSidePanel === 'function') {
      // TranslatePanel is a named PanelComponent descriptor: (props) => { title, content }
      // Its .name is naturally 'TranslatePanel', which Strapi uses as identifier.
      cmPlugin.apis.addEditViewSidePanel([TranslatePanel]);
    }
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return { data, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};
