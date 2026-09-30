import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Empty } from '../components/ui';

export default function NotFound() {
  return <View style={{ flex: 1, justifyContent: 'center' }}><Empty emoji="🌫️" title="This vibe drifted away"><Button title="Back to the Stream" onPress={() => router.replace('/')} /></Empty></View>;
}
