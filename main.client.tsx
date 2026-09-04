import type { PluginSurfaceProps } from "@getpaseo/plugin";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

export function MainSurface({ theme, layout }: PluginSurfaceProps) {
  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        backgroundColor: theme.colors.surface0,
      },
      text: { color: theme.colors.foreground },
    }),
    [theme, layout.compact],
  );
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>Hello from my plugin</Text>
    </View>
  );
}
