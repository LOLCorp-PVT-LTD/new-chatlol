import React, { useState } from 'react';
import { router } from 'expo-router';
import type { Friendship, UserPublic } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast, toast } from '../lib/actions';
import { confirmDialog } from '../lib/dialog';
import { useSession } from '../lib/store';
import { Button, Row } from './ui';

/** Add friend / Requested / Accept + Decline / Friends ✓ — whatever fits how you stand with this person. */
export function FriendButton({ user, onChange }: { user: Pick<UserPublic, 'id' | 'displayName' | 'friendship'>; onChange?: (f: Friendship) => void }) {
  const me = useSession((s) => s.user);
  const [busy, setBusy] = useState(false);
  const first = user.displayName.split(' ')[0];
  async function run(fn: () => Promise<{ friendship: Friendship }>, done?: string) {
    if (!me) return router.push('/join');
    setBusy(true);
    try {
      const r = await fn();
      onChange?.(r.friendship);
      if (done) toast({ kind: 'info', title: done });
    } catch (e) { errorToast(e); } finally { setBusy(false); }
  }
  const f = user.friendship ?? 'none';
  if (f === 'incoming')
    return (
      <Row gap={6}>
        <Button small title="Accept" icon="how-to-reg" disabled={busy} onPress={() => run(() => api.acceptFriend(user.id), `You and ${first} are friends now 🤝`)} />
        <Button small title="Decline" variant="white" disabled={busy} onPress={() => run(() => api.declineFriend(user.id))} />
      </Row>
    );
  if (f === 'outgoing')
    return <Button small title="Requested" icon="schedule" variant="white" disabled={busy} onPress={async () => {
      if (await confirmDialog({ title: 'Cancel friend request?', body: `${first} won’t see it any more.`, icon: 'person-remove', confirmText: 'Cancel request', cancelText: 'Keep it' })) await run(() => api.cancelFriendRequest(user.id));
    }} />;
  if (f === 'friends')
    return <Button small title="Friends ✓" icon="group" variant="white" disabled={busy} onPress={async () => {
      if (await confirmDialog({ title: `Unfriend ${first}?`, body: 'You’ll still follow each other unless you unfollow too.', icon: 'person-remove', danger: true, confirmText: 'Unfriend' })) await run(() => api.unfriend(user.id));
    }} />;
  return <Button small title="Add friend" icon="person-add" variant="white" disabled={busy} onPress={() => run(() => api.addFriend(user.id), 'Friend request sent 🤝')} />;
}
