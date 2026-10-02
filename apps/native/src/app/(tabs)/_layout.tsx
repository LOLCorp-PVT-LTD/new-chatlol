import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { GlassTabBar, TopBar } from '../../components/chrome';
import { useColors } from '../../lib/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <TopBar />
      <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.surface } }} tabBar={(p) => <GlassTabBar {...(p as unknown as React.ComponentProps<typeof GlassTabBar>)} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="feed" />
        <Tabs.Screen name="shouts" />
        <Tabs.Screen name="roulette" />
        <Tabs.Screen name="lounges" />
        {/* Not in the tab bar (no TAB_ICONS entry) but still part of the tab stack: opened from Home. */}
        <Tabs.Screen name="drops" />
        <Tabs.Screen name="arena" />
      </Tabs>
    </View>
  );
}
