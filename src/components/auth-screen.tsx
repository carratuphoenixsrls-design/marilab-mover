import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { gradients, palette, radius, spacing, typography } from '@/constants/app-theme';
import { useAppStore } from '@/store/app-store';
import { AppButton, AppInput, Card } from './ui';

export function LoginScreen() {
  const { login, requestPasswordReset, backendError } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetFeedback, setResetFeedback] = useState('');
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1000;

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    const result = await login(email, password);
    setError(result.error ?? '');
    setLoading(false);
  };

  const resetPassword = async () => {
    setError('');
    setResetFeedback('');
    const result = await requestPasswordReset(email);
    if (!result.ok) {
      setError(result.error ?? 'Invio non riuscito.');
      return;
    }
    setResetFeedback('Email inviata. Apri il link ricevuto per scegliere una nuova password.');
  };

  return (
    <LinearGradient colors={gradients.login} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.background}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.scroll, isDesktopWeb && styles.scrollDesktop]} keyboardShouldPersistTaps="handled">
            <View style={[styles.loginLayout, isDesktopWeb && styles.loginLayoutDesktop]}>
              <View style={[styles.brandBlock, isDesktopWeb && styles.brandBlockDesktop]}>
                <View style={styles.accessBadge}>
                  <View style={styles.accessDot} />
                  <Text style={styles.accessBadgeText}>ACCESSO AZIENDALE SICURO</Text>
                </View>
                <View style={[styles.officialLogoCard, isDesktopWeb && styles.officialLogoCardDesktop]}>
                  <Image source={require('../../assets/images/mover-icon.png')} style={[styles.officialLogo, isDesktopWeb && styles.officialLogoDesktop]} resizeMode="contain" />
                </View>
                <Text style={[styles.title, isDesktopWeb && styles.titleDesktop]}>Marilab Mover</Text>
                <Text style={[styles.subtitle, isDesktopWeb && styles.subtitleDesktop]}>La rete operativa Marilab, sempre con te.</Text>
                {isDesktopWeb ? (
                  <View style={styles.desktopFeatureList}>
                    <View style={styles.desktopFeatureRow}><Ionicons name="swap-horizontal-outline" size={19} color={palette.brandGlow} /><Text style={styles.desktopFeatureText}>Richieste e consegne in tempo reale</Text></View>
                    <View style={styles.desktopFeatureRow}><Ionicons name="chatbubble-ellipses-outline" size={19} color={palette.brandGlow} /><Text style={styles.desktopFeatureText}>Chat generale, privata e per consegna</Text></View>
                    <View style={styles.desktopFeatureRow}><Ionicons name="notifications-outline" size={19} color={palette.brandGlow} /><Text style={styles.desktopFeatureText}>Notifiche su app, PC e PWA</Text></View>
                  </View>
                ) : null}
              </View>

              <Card style={[styles.loginCard, isDesktopWeb && styles.loginCardDesktop]}>
                <View style={styles.cardHeading}>
                  <Text style={styles.cardTitle}>Accedi</Text>
                  <Text style={styles.cardText}>Usa l’account creato dall’amministratore di Marilab Mover.</Text>
                </View>
                <AppInput
                  label="Email aziendale"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="nome@marilab.it"
                />
                <AppInput
                  label="Password"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  onSubmitEditing={() => void submit()}
                />
                <Pressable onPress={() => void resetPassword()} style={styles.forgotPassword}><Text style={styles.forgotPasswordText}>Password dimenticata?</Text></Pressable>
                {resetFeedback ? <Text style={styles.success}>{resetFeedback}</Text> : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {backendError && !error ? (
                  <View style={styles.backendBanner}>
                    <Ionicons name="alert-circle-outline" size={19} color={palette.warning} />
                    <Text style={styles.backendText}>{backendError}</Text>
                  </View>
                ) : null}
                <AppButton label={loading ? 'Accesso in corso…' : 'Accedi'} icon="log-in-outline" disabled={loading} onPress={() => void submit()} />
                <View style={styles.infoRow}>
                  <Ionicons name="shield-checkmark-outline" size={19} color={palette.brand} />
                  <Text style={styles.infoText}>Nessuna registrazione libera. Gli account vengono autorizzati dall’Admin.</Text>
                </View>
              </Card>
            </View>

            <Text style={styles.author}>Marilab Mover Enterprise 1.8.2 · Autore Fabio Carratù</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

export function ChangePasswordScreen() {
  const { currentUser, passwordRecovery, changeOwnPassword, logout } = useAppStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (password !== confirm) {
      setError('Le password non coincidono.');
      return;
    }
    setLoading(true);
    const result = await changeOwnPassword(password);
    setError(result.error ?? '');
    setLoading(false);
  };

  return (
    <LinearGradient colors={gradients.login} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.background}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.changeScroll} keyboardShouldPersistTaps="handled">
            <LinearGradient colors={[palette.brandBright, palette.brandDark]} style={styles.logoSmall}>
              <Ionicons name="key-outline" size={31} color={palette.white} />
            </LinearGradient>
            <Text style={styles.titleSmall}>{passwordRecovery ? 'Reimposta la password' : 'Crea la tua password'}</Text>
            <Text style={styles.changeSubtitle}>{passwordRecovery ? 'Scegli una nuova password sicura per continuare.' : `Ciao ${currentUser.fullName}. Questo passaggio è richiesto soltanto al primo accesso.`}</Text>
            <Card style={styles.loginCard}>
              <AppInput label="Nuova password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Almeno 8 caratteri" />
              <AppInput label="Conferma password" secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Ripeti la password" />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <AppButton label={loading ? 'Salvataggio…' : 'Salva e continua'} icon="checkmark-circle-outline" disabled={loading} onPress={() => void submit()} />
              <AppButton label="Esci" icon="log-out-outline" variant="ghost" onPress={() => void logout()} />
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  background: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, gap: spacing.lg, maxWidth: 720, width: '100%', alignSelf: 'center', justifyContent: 'center' },
  scrollDesktop: { maxWidth: 1580, paddingHorizontal: 64, paddingVertical: 48, gap: 28 },
  loginLayout: { width: '100%', gap: spacing.lg },
  loginLayoutDesktop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 72 },
  brandBlock: { alignItems: 'center', gap: spacing.sm },
  brandBlockDesktop: { flex: 1, alignItems: 'flex-start', maxWidth: 680, gap: 13 },
  accessBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.11)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', marginBottom: spacing.sm },
  accessDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#75F0BD' },
  accessBadgeText: { color: 'rgba(255,255,255,0.82)', fontSize: 9, fontWeight: '900', letterSpacing: 1.05, fontFamily: typography.body },
  officialLogoCard: { width: 112, height: 112, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.brandDark, shadowColor: palette.black, shadowOpacity: 0.24, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  officialLogo: { width: 112, height: 112 },
  officialLogoCardDesktop: { width: 138, height: 138, borderRadius: 38 },
  officialLogoDesktop: { width: 138, height: 138 },
  title: { color: palette.white, fontFamily: typography.display, fontWeight: '800', fontSize: 32, letterSpacing: -1.15 },
  titleDesktop: { fontSize: 48, lineHeight: 56, letterSpacing: -1.7 },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontFamily: typography.body, fontSize: 14, textAlign: 'center' },
  subtitleDesktop: { textAlign: 'left', fontSize: 17, lineHeight: 25 },
  desktopFeatureList: { marginTop: 18, gap: 13 },
  desktopFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  desktopFeatureText: { color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '700', fontFamily: typography.body },
  loginCard: { gap: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center', padding: spacing.xl, borderRadius: radius.xl, borderColor: 'rgba(255,255,255,0.65)', shadowOpacity: 0.22, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 11 },
  loginCardDesktop: { width: 520, flexShrink: 0, padding: 34, gap: 22, borderRadius: 30 },
  cardHeading: { gap: 5 },
  cardTitle: { color: palette.textStrong, fontFamily: typography.display, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  cardText: { color: palette.textMuted, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  forgotPassword: { alignSelf: 'flex-end', paddingVertical: 4 },
  forgotPasswordText: { color: palette.brand, fontFamily: typography.body, fontWeight: '800', fontSize: 13 },
  success: { color: palette.success, fontFamily: typography.body, fontWeight: '700', fontSize: 13, lineHeight: 18 },
  error: { color: palette.danger, fontFamily: typography.body, fontWeight: '700', fontSize: 13 },
  backendBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: palette.warningSoft, borderRadius: radius.md, padding: spacing.md },
  backendText: { flex: 1, color: '#7A5400', fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: palette.brandMist, borderRadius: radius.md, padding: spacing.md },
  infoText: { flex: 1, color: palette.textMuted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  author: { color: 'rgba(255,255,255,0.60)', fontFamily: typography.body, fontSize: 10, textAlign: 'center', fontWeight: '700' },
  changeScroll: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center', alignItems: 'center', maxWidth: 620, width: '100%', alignSelf: 'center' },
  logoSmall: { width: 68, height: 68, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  titleSmall: { color: palette.white, fontFamily: typography.display, fontSize: 29, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  changeSubtitle: { color: 'rgba(255,255,255,0.72)', fontFamily: typography.body, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 460 },
});
