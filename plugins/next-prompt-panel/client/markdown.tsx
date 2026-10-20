import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, type ReactNode } from "react";
import { Linking, Platform, Text, View, type TextStyle } from "react-native";
import { parseBlocks, parseInline, type Block, type Inline } from "../shared/markdown";

const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, monospace",
});

function inline(nodes: Inline[], theme: PluginTheme, key = ""): ReactNode[] {
  return nodes.map((node, index) => {
    const id = `${key}${index}`;
    switch (node.kind) {
      case "text":
        return node.text;
      case "bold":
        return (
          <Text key={id} style={{ fontWeight: "700", color: theme.colors.foreground }}>
            {inline(node.children, theme, `${id}.`)}
          </Text>
        );
      case "italic":
        return (
          <Text key={id} style={{ fontStyle: "italic" }}>
            {inline(node.children, theme, `${id}.`)}
          </Text>
        );
      case "code":
        return (
          <Text
            key={id}
            style={{
              fontFamily: MONO,
              fontSize: 13,
              color: theme.colors.foreground,
              backgroundColor: theme.colors.surface2,
            }}
          >
            {` ${node.text} `}
          </Text>
        );
      case "link":
        return (
          <Text
            key={id}
            accessibilityRole="link"
            style={{ color: theme.colors.accent, textDecorationLine: "underline" }}
            onPress={() => void Linking.openURL(node.href).catch(() => undefined)}
          >
            {inline(node.children, theme, `${id}.`)}
          </Text>
        );
    }
  });
}

function Blocks({ blocks, theme, base }: { blocks: Block[]; theme: PluginTheme; base: TextStyle }) {
  return (
    <View style={{ gap: 10, minWidth: 0 }}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return (
              <Text
                key={index}
                accessibilityRole="header"
                style={{
                  ...base,
                  color: theme.colors.foreground,
                  fontWeight: "600",
                  fontSize: block.level <= 1 ? 22 : block.level === 2 ? 19 : 16,
                  lineHeight: block.level <= 1 ? 30 : block.level === 2 ? 27 : 24,
                  marginTop: 6,
                }}
              >
                {inline(parseInline(block.text), theme)}
              </Text>
            );
          case "paragraph":
            return (
              <Text key={index} selectable style={base}>
                {inline(parseInline(block.text), theme)}
              </Text>
            );
          case "list":
            return (
              <View key={index} style={{ gap: 4, minWidth: 0 }}>
                {block.items.map((item, row) => (
                  <View key={row} style={{ flexDirection: "row", gap: 8, minWidth: 0 }}>
                    <Text style={{ ...base, minWidth: block.ordered ? 20 : 10 }}>
                      {block.ordered ? `${block.start + row}.` : "•"}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text selectable style={base}>
                        {inline(parseInline(item.text), theme)}
                      </Text>
                      {item.children.length ? (
                        <Blocks blocks={item.children} theme={theme} base={base} />
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            );
          case "quote":
            return (
              <View
                key={index}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: theme.colors.border,
                  paddingLeft: 12,
                }}
              >
                <Blocks
                  blocks={block.blocks}
                  theme={theme}
                  base={{ ...base, color: theme.colors.foregroundMuted }}
                />
              </View>
            );
          case "code":
            return (
              <View
                key={index}
                style={{
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: theme.colors.surface1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text
                  selectable
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    lineHeight: 20,
                    color: theme.colors.foreground,
                  }}
                >
                  {block.text}
                </Text>
              </View>
            );
          case "rule":
            return <View key={index} style={{ height: 1, backgroundColor: theme.colors.border }} />;
        }
      })}
    </View>
  );
}

/** Renders reply Markdown with the reply's text size: 15/24 body, muted values with `muted`. */
export function Markdown({
  text,
  theme,
  muted = false,
  size = 15,
}: {
  text: string;
  theme: PluginTheme;
  muted?: boolean;
  size?: number;
}) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const base: TextStyle = {
    color: muted ? theme.colors.foregroundMuted : theme.colors.foreground,
    fontSize: size,
    lineHeight: Math.round(size * 1.6),
    flexShrink: 1,
  };
  return <Blocks blocks={blocks} theme={theme} base={base} />;
}
