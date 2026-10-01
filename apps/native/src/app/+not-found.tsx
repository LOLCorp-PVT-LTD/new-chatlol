import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Button, Empty } from '../components/ui';

export default function NotFound() {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Image source={require('../../assets/brand/mascot.png')} style={{ width: 120, height: 116, transform: [{ rotate: '-12deg' }] }} contentFit="contain" /><Empty emoji="" title="This vibe drifted away"><Button title="Back to the Stream" onPress={() => router.replace('/')} /></Empty></View>;
}
