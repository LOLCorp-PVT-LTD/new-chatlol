import React from 'react';
import { View } from 'react-native';
import { ScreenHeader } from '../components/chrome';
import { ProfileView } from '../components/Profile';

export default function Locker() {
  return <View style={{ flex: 1 }}><ScreenHeader title="My Locker" /><ProfileView /></View>;
}
