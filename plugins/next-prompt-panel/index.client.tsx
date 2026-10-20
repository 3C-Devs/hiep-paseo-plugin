import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createNextPromptPanel, panelSchema } from "./client/panel";
import { sectionIntro, splitNextSection, splitRecap } from "./shared/section";

export default function contribute(client: PluginClientContext) {
  // Paseo 0.12 transformers replace the whole reply, so the panel also carries the text before it.
  const transformer = client.addTimelineTransformer({
    id: "next-prompt-panel",
    query: { itemType: "assistant_message" },
    transform({ item, phase }) {
      if (phase !== "complete") return undefined;
      const split = splitNextSection(item.text);
      if (!split) return undefined;
      const recap = splitRecap(split.before);
      return {
        items: [
          {
            type: "plugin" as const,
            kind: "next-prompt-panel",
            version: 1,
            data: {
              title: split.title,
              intro: sectionIntro(split.section),
              section: split.section,
              ...(recap.before.trim() ? { before: recap.before } : {}),
              ...(recap.recap ? { recap: recap.recap } : {}),
            },
          },
        ],
      };
    },
  });
  const renderer = client.addTimelineRenderer({
    kind: "next-prompt-panel",
    version: 1,
    schema: panelSchema,
    Component: createNextPromptPanel(client),
  });
  return () => {
    renderer();
    transformer();
  };
}
