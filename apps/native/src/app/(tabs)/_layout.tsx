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
        <Tabs.Screen name="roulette" />
        <Tabs.Screen name="drops" />
        <Tabs.Screen name="arena" />
        <Tabs.Screen name="lounges" />
      </Tabs>
    </View>
  );
}
