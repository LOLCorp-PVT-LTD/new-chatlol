import React, { useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatMessage } from '@chatlol/shared';
import { timeAgo } from '@chatlol/shared';
import { useSession } from '../lib/store';
import { useColors } from '../lib/theme';
import { Avatar, UserName } from './people';
import { IconButton, Input, Row, Text } from './ui';

export function ChatList({ messages, showNames = true, footer }: { messages: ChatMessage[]; showNames?: boolean; footer?: React.ReactNode }) {
  const c = useColors();
  const me = useSession((s) => s.user?.id);
  const ref = useRef<FlatList<ChatMessage>>(null);
  return (
    <FlatList
      ref={ref}
      data={messages}
      keyExtractor={(m) => m.id}
      onContentSizeChange={() => ref.current?.scrollToEnd({ animated: true })}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListFooterComponent={footer ? <View>{footer}</View> : null}
      renderItem={({ item: m, index }) => {
        const mine = m.author.id === me;
        const grouped = index > 0 && messages[index - 1].author.id === m.author.id;
        return (
          <Row gap={8} style={{ alignItems: 'flex-end', flexDirection: mine ? 'row-reverse' : 'row', marginTop: grouped ? -6 : 0 }}>
            {showNames && !mine ? <View style={{ width: 30 }}>{!grouped ? <Avatar user={m.author} size={30} /> : null}</View> : null}
            <View style={{ maxWidth: '78%', gap: 2, alignItems: mine ? 'flex-end' : 'flex-start' }}>
              {showNames && !mine && !grouped ? <Row gap={6}><UserName user={m.author} variant="bodyMd" /><Text variant="labelSm" color={c.outline}>{timeAgo(m.createdAt)}</Text></Row> : null}
              {m.mediaUrl ? <Image source={m.mediaUrl} style={{ width: 220, height: 260, borderRadius: 20 }} contentFit="cover" /> : null}
              {m.body ? (
                <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, backgroundColor: m.kind === 'gift' ? c.sunlit : mine ? c.flame : c.surfaceContainerLow,
                  borderBottomRightRadius: mine ? 6 : 22, borderBottomLeftRadius: mine ? 22 : 6 }}>
                  <Text color={mine && m.kind !== 'gift' ? '#fff' : c.onSurface}>{m.body}</Text>
                </View>
              ) : null}
            </View>
          </Row>
        );
      }}
    />
  );
}

export function Composer({ value, onChange, onSend, placeholder, onAttach, onTyping }: { value: string; onChange: (s: string) => void; onSend: () => void; placeholder: string; onAttach?: () => void; onTyping?: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Row gap={8} style={{ padding: 10, paddingBottom: Math.max(10, insets.bottom), borderTopWidth: 1, borderTopColor: c.sandstone, backgroundColor: c.surfaceContainerLowest }}>
      {onAttach ? <IconButton name="image" label="Attach photo" bg={c.sunlit} color={c.flame} onPress={onAttach} /> : null}
      <Input value={value} onChangeText={(t) => { onChange(t); onTyping?.(); }} placeholder={placeholder} style={{ flex: 1, minHeight: 46 }} onSubmitEditing={onSend} returnKeyType="send" maxLength={2000} />
      <IconButton name="send" label="Send" bg={value.trim() ? c.flame : c.surfaceContainer} color="#fff" onPress={onSend} />
    </Row>
  );
}

export function ChatScreen({ children }: { children: React.ReactNode }) {
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{children}</KeyboardAvoidingView>;
}
