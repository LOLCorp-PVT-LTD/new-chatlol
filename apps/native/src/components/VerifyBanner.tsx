import React, { useState } from 'react';
import { View } from 'react-native';
import { api } from '../lib/api';
import { errorToast } from '../lib/actions';
import { useSession } from '../lib/store';
import { useColors } from '../lib/theme';
import { Button, IconButton, Row, Text } from './ui';

export function VerifyBanner() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [hidden, setHidden] = useState(false);
  const [sent, setSent] = useState(false);
  if (!user || user.emailVerified || hidden) return null;
  return (
    <Row gap={10} style={{ backgroundColor: c.sunlit, borderRadius: 24, padding: 12 }}>
      <Text style={{ fontSize: 22, lineHeight: 28 }}>✉️</Text>
      <View style={{ flex: 1 }}>
        <Text variant="labelLg">Verify your email for +50 Sparks</Text>
        <Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={2}>{sent ? `New link sent to ${user.email}` : 'Needed to go live and buy Gems.'}</Text>
      </View>
      {!sent ? <Button small title="Resend" variant="white" onPress={() => api.resendVerification().then(() => setSent(true)).catch(errorToast)} /> : null}
      <IconButton name="close" label="Dismiss" size={32} onPress={() => setHidden(true)} />
    </Row>
  );
}
