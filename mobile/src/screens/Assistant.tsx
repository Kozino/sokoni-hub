/**
 * Sokoni Assistant — search the live catalogue, fill the existing cart, hand off to Checkout.
 * Never places an order. Voice is push-to-talk. Transcripts follow Qatar PDPPL (consent, retention, deletion).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { assistantApi, errorText, type AgentCard, type AssistantAction, type ChatMessage } from '../assistant';
import { useCity } from '../city';
import { useCheckoutDraft } from '../checkoutDraft';
import { rememberImages } from '../data';
import { tap } from '../haptics';
import { useI18n, useT } from '../i18n';
import { Icon } from '../icons';
import { Price, Screen, Thumb, softShadow } from '../kit';
import type { NavProps } from '../nav';
import { useCart, useTheme } from '../providers';
import { useToast } from '../toast';
import { Button, Header, Notice, Sheet, Spinner, Text, TextInput } from '../ui';
import { startNativeRecording, stopSpeaking, speak, webListen } from '../voice';

const CONSENT_KEY = 'sokoni_assistant_consent';
const VOICE_KEY = 'sokoni_assistant_voice_consent';

export function Assistant({ go, back }: NavProps) {
  const { colors } = useTheme();
  const t = useT();
  const { locale, dir } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const { city } = useCity();
  const [draft] = useCheckoutDraft();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [sttOn, setSttOn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceSheet, setVoiceSheet] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [banner, setBanner] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const rec = useRef<{ stop: () => Promise<string | null> } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      await assistantApi.ready();
      const [saved, vSaved, status, thread] = await Promise.all([
        AsyncStorage.getItem(CONSENT_KEY),
        AsyncStorage.getItem(VOICE_KEY),
        assistantApi.status().catch(() => null),
        assistantApi.thread().catch(() => null),
      ]);
      if (!live) return;
      setConsent(saved === 'yes');
      setVoiceConsent(vSaved === 'yes');
      setEnabled(status?.enabled !== false);
      setVoiceOn(!!status?.voice_enabled);
      setSttOn(!!status?.stt_configured);
      if (thread?.thread_id) setThreadId(thread.thread_id);
      if (thread?.messages?.length) {
        setMessages(thread.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, cards: m.cards, actions: m.actions })));
      }
      setReady(true);
    })();
    return () => { live = false; stopSpeaking(); };
  }, []);

  useEffect(() => { const tmr = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); return () => clearTimeout(tmr); }, [messages, busy]);

  const accept = async () => { await AsyncStorage.setItem(CONSENT_KEY, 'yes'); setConsent(true); };
  const applyActions = (actions: AssistantAction[] = []) => {
    for (const action of actions) {
      if (action.type === 'add_to_cart') {
        cart.add({
          listing_id: action.listing_id, vendor_id: action.vendor_id, vendor_name: action.vendor_name, title: action.title,
          price: action.price, currency: action.currency, image: action.image, qty: action.qty, max: action.max, kind: 'product', unit: action.unit, option: action.option,
        });
        toast.show(t('assistant.add'), true);
      }
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    if (!enabled) return setBanner(t('assistant.paused'));
    setInput('');
    setBanner('');
    const localId = `local-${Date.now()}`;
    setMessages((old) => [...old, { id: localId, role: 'user', content: message }]);
    setBusy(true);
    try {
      const result = await assistantApi.chat({ message, locale, city: city || undefined, fulfilment_mode: draft.mode, cart: cart.items, thread_id: threadId });
      setThreadId(result.thread_id);
      if (result.cards?.length) rememberImages(result.cards.map((c) => ({ id: c.id, images: c.images })));
      applyActions(result.actions);
      setMessages((old) => [...old, {
        id: result.message_id, role: 'assistant', content: result.text, cards: result.cards, actions: result.actions, quote: result.quote, proposed_checkout: result.proposed_checkout,
      }]);
    } catch (e) {
      setBanner(errorText(e, t('assistant.offline')));
    } finally { setBusy(false); }
  };

  const clearChat = () => {
    Alert.alert(t('assistant.clearTitle'), t('assistant.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('assistant.clear'), style: 'destructive', onPress: () => void assistantApi.clear().then(() => { setMessages([]); setThreadId(null); }) },
    ]);
  };

  const onMicDown = async () => {
    if (!voiceOn) return Alert.alert('', t('assistant.sttUnavailable'));
    if (!voiceConsent) { setVoiceSheet(true); return; }
    tap();
    if (Platform.OS === 'web') {
      setListening(true);
      const text = await webListen(locale);
      setListening(false);
      if (text) setInput(text);
      else setBanner(t('assistant.sttUnavailable'));
      return;
    }
    const handle = await startNativeRecording();
    if (!handle) { setBanner(t('assistant.micDenied')); return; }
    rec.current = handle;
    setListening(true);
  };
  const onMicUp = async () => {
    if (!rec.current) { setListening(false); return; }
    const handle = rec.current;
    rec.current = null;
    setListening(false);
    const uri = await handle.stop();
    if (!uri) return;
    if (!sttOn) { setBanner(t('assistant.sttUnavailable')); return; }
    setBusy(true);
    try {
      const { text } = await assistantApi.transcribe(uri, locale);
      setInput(text);
    } catch (e) {
      setBanner(errorText(e, t('assistant.sttUnavailable')));
    } finally { setBusy(false); }
  };

  const rtl = dir === 'rtl';

  if (!ready) return <Screen><Header title={t('assistant.title')} back={back} /><Spinner label={t('common.loading')} /></Screen>;

  return (
    <Screen>
      <Header title={t('assistant.title')} back={back} right={<Pressable accessibilityRole="button" accessibilityLabel={t('assistant.clear')} onPress={clearChat} hitSlop={8}><Icon name="trash" solid={false} size={20} color={colors.text2} /></Pressable>} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.thread}>
          <Text style={{ fontSize: 11.5, color: colors.text2, lineHeight: 16, paddingHorizontal: 4 }}>{t('assistant.subtitle')}</Text>
          {!messages.length ? (
            <View style={{ marginTop: 18, gap: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{t('assistant.emptyTitle')}</Text>
              <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 18 }}>{t('assistant.emptyText')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {(['assistant.suggest1', 'assistant.suggest2', 'assistant.suggest3', 'assistant.suggest4'] as const).map((key) => (
                  <Pressable key={key} onPress={() => void send(t(key))} style={[s.chip, { backgroundColor: colors.primarySoft, borderColor: colors.primaryLine }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{t(key)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {messages.map((m) => (
            <View key={m.id} style={{ alignItems: m.role === 'user' ? (rtl ? 'flex-start' : 'flex-end') : (rtl ? 'flex-end' : 'flex-start') }}>
              <View style={[s.bubble, m.role === 'user' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }, softShadow(colors.shadow)]}>
                <Text style={{ fontSize: 13, lineHeight: 18, color: m.role === 'user' ? colors.onPrimary : colors.text }}>{m.content}</Text>
              </View>
              {m.role === 'assistant' ? (
                <Pressable onPress={() => { if (speaking) { stopSpeaking(); setSpeaking(false); } else { speak(m.content, locale); setSpeaking(true); } }} style={{ marginTop: 4, marginHorizontal: 4 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primary }}>{speaking ? t('assistant.stopSpeak') : t('assistant.speak')}</Text>
                </Pressable>
              ) : null}
              {m.cards?.length ? <View style={{ gap: 8, marginTop: 8, alignSelf: 'stretch' }}>{m.cards.map((card) => <CardRow key={card.id} card={card} go={go} onAdd={(option) => {
                if (card.kind === 'service') return go('listing', { id: card.id });
                if ((card.options?.length ?? 0) > 0 && !option) return;
                cart.add({
                  listing_id: card.id, vendor_id: card.vendor_id, vendor_name: card.business_name || 'Local seller', title: option ? `${card.title} (${option})` : card.title,
                  price: Number(card.price), currency: card.currency, image: card.images?.[0], qty: 1, max: card.quantity ?? undefined, kind: 'product', unit: card.unit, option,
                });
                toast.show(t('assistant.add'), true);
              }} />)}</View> : null}
              {m.proposed_checkout || m.actions?.some((a) => a.type === 'open_checkout') ? (
                <Button style={{ marginTop: 8, alignSelf: 'stretch' }} onPress={() => go('checkout', { fromAssistant: true })}>{t('assistant.reviewOrder')}</Button>
              ) : null}
            </View>
          ))}
          {busy ? <Text style={{ fontSize: 11.5, color: colors.muted }}>{t('common.loading')}</Text> : null}
          {banner ? <Notice type="warning">{banner}</Notice> : null}
          <Text style={{ fontSize: 10.5, color: colors.muted, lineHeight: 15, marginTop: 8 }}>{t('assistant.disclaimer')}</Text>
          <Text style={{ fontSize: 10, color: colors.muted, lineHeight: 14 }}>{t('assistant.legalNote')}</Text>
        </ScrollView>

        <View style={[s.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            accessibilityLabel={t('assistant.placeholder')}
            value={input}
            onChangeText={setInput}
            placeholder={listening ? t('assistant.listening') : t('assistant.placeholder')}
            placeholderTextColor={colors.muted}
            style={[s.input, { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border }]}
            returnKeyType="send"
            onSubmitEditing={() => void send(input)}
          />
          {voiceOn ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('assistant.holdMic')}
              onPressIn={() => void onMicDown()}
              onPressOut={() => void onMicUp()}
              style={[s.mic, { backgroundColor: listening ? colors.orange : colors.lav2 }]}
            >
              <Icon name="mic" solid={false} size={20} color={listening ? colors.onOrange : colors.text} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('assistant.send')} onPress={() => void send(input)} style={[s.send, { backgroundColor: colors.primary }]}>
            <Icon name="send" size={18} color={colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={!consent} title={t('assistant.consentTitle')} onClose={back}>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.text2, marginBottom: 12 }}>{t('assistant.consentBody')}</Text>
        <Button onPress={() => void accept()}>{t('assistant.consentAccept')}</Button>
        <Button variant="ghost" style={{ marginTop: 6 }} onPress={back}>{t('assistant.consentDecline')}</Button>
      </Sheet>
      <Sheet visible={voiceSheet} title={t('assistant.voiceConsentTitle')} onClose={() => setVoiceSheet(false)}>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.text2, marginBottom: 12 }}>{t('assistant.voiceConsentBody')}</Text>
        <Button onPress={() => { void AsyncStorage.setItem(VOICE_KEY, 'yes'); setVoiceConsent(true); setVoiceSheet(false); }}>{t('assistant.voiceAllow')}</Button>
        <Button variant="ghost" style={{ marginTop: 6 }} onPress={() => setVoiceSheet(false)}>{t('common.cancel')}</Button>
      </Sheet>
    </Screen>
  );
}

function CardRow({ card, go, onAdd }: { card: AgentCard; go: NavProps['go']; onAdd: (option?: string) => void }) {
  const { colors } = useTheme();
  const t = useT();
  const service = card.kind === 'service';
  const options = card.options || [];
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => go('listing', { id: card.id })} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Thumb uri={card.images?.[0]} style={s.thumb} icon={service ? 'service-bell' : 'basket'} iconSize={18} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontSize: 12.5, fontWeight: '700', color: colors.text }}>{card.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 10.5, color: colors.text2, marginTop: 2 }}>{[card.business_name, card.vendor_city].filter(Boolean).join(' · ')}</Text>
        <Price value={card.price} currency={card.currency} />
        {service ? <Text style={{ fontSize: 10.5, color: colors.gold, marginTop: 2 }}>{t('assistant.serviceHint')}</Text> : null}
        {open && options.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {options.map((opt) => (
              <Pressable key={opt.name} onPress={() => { onAdd(opt.name); setOpen(false); }} style={[s.chip, { backgroundColor: colors.orangeSoft, borderColor: colors.orangeLine }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.brown }}>{opt.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Button
        variant={service ? 'tonal' : 'gold'}
        style={{ minHeight: 34, paddingHorizontal: 10 }}
        onPress={() => {
          if (service) go('listing', { id: card.id });
          else if (options.length && !open) setOpen(true);
          else onAdd();
        }}
      >{service ? t('assistant.book') : options.length && !open ? t('assistant.chooseSize') : t('assistant.add')}</Button>
    </Pressable>
  );
}

const s = StyleSheet.create({
  thread: { padding: 12, paddingBottom: 18, gap: 10 },
  bubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 96, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingTop: 10, fontSize: 14 },
  mic: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  send: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 8 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, height: 30, justifyContent: 'center' },
});
