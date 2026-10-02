import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { confirmDialog } from '../lib/dialog';
import type { PremiumPlan } from '@chatlol/shared';
import { PREMIUM_PERKS } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast, refreshMe, toast } from '../lib/actions';
import { buyPack, purchaseChannel, purchasesAvailable } from '../lib/purchases';
import { session, useSession } from '../lib/store';
import { shadow, useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Button, Card, Gradient, Row, Text } from '../components/ui';

/** ChatLOL Premium passes: in-app purchase on iOS/Android (Stripe on web/desktop), or a steep amount of Sparks. */
export default function Premium() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [info, setInfo] = useState<{ plans: PremiumPlan[]; premiumUntil: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void api.premium().then(setInfo).catch(errorToast); }, []);

  async function pay(p: PremiumPlan) {
    setBusy(p.id);
    try {
      const r = await buyPack(p.id);
      if (r === 'purchased' && purchaseChannel === 'iap') {
        toast({ kind: 'reward', title: 'Welcome to Premium 👑' });
        setTimeout(() => void refreshMe().then(() => api.premium().then(setInfo)), 2500); // webhook lands shortly after
      }
    } catch (e) { errorToast(e); } finally { setBusy(null); }
  }
  async function sparks(p: PremiumPlan) {
    if (!(await confirmDialog({ title: `Premium ${p.label}`, body: `Spend ${p.sparks.toLocaleString()} Sparks on ${p.label} of Premium?`, icon: 'workspace-premium', confirmText: `Spend ${p.sparks.toLocaleString()} ✦` }))) return;
    setBusy(p.id);
    try { const r = await api.buyPremium(p.id); session.set({ user: r.user }); setInfo(await api.premium()); toast({ kind: 'reward', title: 'Welcome to Premium 👑' }); } catch (e) { errorToast(e); } finally { setBusy(null); }
  }
  const until = info?.premiumUntil ?? user?.premiumUntil;
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Premium" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
        <Gradient colors={['#1a110c', `${c.flame}aa`, c.flame]} style={[{ borderRadius: 30, padding: 20, gap: 8 }, shadow.float]}>
          <Text variant="labelSm" color="rgba(255,255,255,0.8)">CHATLOL PREMIUM</Text>
          <Text variant="headlineLg" color="#fff">👑 Know who’s into your vibe</Text>
          {until ? <Text color="#fff">Premium until {new Date(until).toLocaleDateString()} — buying again adds days.</Text> : null}
          {PREMIUM_PERKS.map((p) => <Text key={p.title} color="#fff">{p.emoji}  {p.title}</Text>)}
        </Gradient>
        {info?.plans.map((p) => (
          <Card key={p.id} style={{ padding: 16, gap: 8, borderWidth: p.best ? 2 : 0, borderColor: c.flame }}>
            <Row style={{ justifyContent: 'space-between' }}><Text variant="headlineMd">{p.label}</Text>{p.best ? <Text variant="labelSm" color={c.flame}>MOST POPULAR</Text> : null}</Row>
            <Text color={c.onSurfaceVariant}>{p.days} days • ${p.usd.toFixed(2)}</Text>
            <Button title={busy === p.id ? 'Opening…' : `Buy for $${p.usd.toFixed(2)}`} disabled={!!busy || !purchasesAvailable()} onPress={() => pay(p)} />
            <Button variant="secondary" title={`⚡ ${p.sparks.toLocaleString()} Sparks`} disabled={!!busy} onPress={() => sparks(p)} />
          </Card>
        ))}
        {user ? <Text variant="bodySm" color={c.onSurfaceVariant} style={{ textAlign: 'center' }}>You have {user.sparks.toLocaleString()} Sparks. Passes don’t renew automatically.</Text> : null}
      </ScrollView>
    </View>
  );
}
