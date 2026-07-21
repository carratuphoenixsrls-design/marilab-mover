import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { gradients, palette, radius, spacing, typography } from '@/constants/app-theme';
import { formatDate, roleLabels, statusLabels, todayIso, visibleStatusFilters } from '@/lib/format';
import { useAppStore } from '@/store/app-store';
import type {
  AdminStatistics,
  DeliveryRequest,
  Equipment,
  NewDeliveryRequest,
  PushAdminDiagnostics,
  RequestStatus,
  StatisticsBreakdownItem,
  StatisticsFilters,
  UserRole,
} from '@/types/domain';
import {
  AppButton,
  AppInput,
  Card,
  ChoiceRow,
  EmptyState,
  SectionTitle,
  StatusPill,
} from './ui';
import { EquipmentEditorModal, SiteManagementModal } from './admin-master-data';
import { UserManagementModal } from './user-management';

type TabKey = 'home' | 'requests' | 'inventory' | 'profile';

interface TabItem {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const tabsByRole: Record<UserRole, TabItem[]> = {
  requester: [
    { key: 'home', label: 'Home', icon: 'home-outline' },
    { key: 'requests', label: 'Richieste', icon: 'calendar-outline' },
    { key: 'profile', label: 'Profilo', icon: 'person-outline' },
  ],
  mover: [
    { key: 'home', label: 'Il mio giro', icon: 'navigate-outline' },
    { key: 'requests', label: 'Attività', icon: 'list-outline' },
    { key: 'profile', label: 'Profilo', icon: 'person-outline' },
  ],
  admin: [
    { key: 'home', label: 'Dashboard', icon: 'grid-outline' },
    { key: 'requests', label: 'Consegne', icon: 'swap-horizontal-outline' },
    { key: 'inventory', label: 'Inventario', icon: 'cube-outline' },
    { key: 'profile', label: 'Gestione', icon: 'settings-outline' },
  ],
};

export function AppShell() {
  const { activeRole } = useAppStore();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);

  const tabs = tabsByRole[activeRole];
  const effectiveTab = tabs.some((tab) => tab.key === activeTab) ? activeTab : 'home';
  const isDesktopWeb = Platform.OS === 'web' && width >= 1100;

  const renderContent = () => {
    if (effectiveTab === 'requests') return <RequestsScreen />;
    if (effectiveTab === 'inventory') return <InventoryScreen />;
    if (effectiveTab === 'profile') return <ProfileScreen onRoleChanged={() => setActiveTab('home')} />;
    if (activeRole === 'requester') return <RequesterHome onOpenRequests={() => setActiveTab('requests')} />;
    if (activeRole === 'mover') return <MoverHome onOpenChat={() => setChatOpen(true)} />;
    return <AdminHome onOpenRequests={() => setActiveTab('requests')} />;
  };

  if (isDesktopWeb) {
    return (
      <View style={styles.root}>
        <View style={styles.desktopShell}>
          <DesktopSidebar
            tabs={tabs}
            activeTab={effectiveTab}
            onSelect={setActiveTab}
            onOpenChat={() => setChatOpen(true)}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenPush={() => setPushOpen(true)}
          />
          <View style={styles.desktopMain}>
            <DesktopTopbar />
            <View style={styles.desktopContent}>{renderContent()}</View>
          </View>
        </View>
        <NotificationsModal visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
        <ChatModal visible={chatOpen} onClose={() => setChatOpen(false)} />
        <PushDiagnosticsModal visible={pushOpen} onClose={() => setPushOpen(false)} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <AppHeader onOpenChat={() => setChatOpen(true)} onOpenNotifications={() => setNotificationsOpen(true)} />
      </SafeAreaView>
      <View style={styles.content}>{renderContent()}</View>
      <SafeAreaView edges={['bottom']} style={styles.safeBottom}>
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const selected = tab.key === effectiveTab;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}>
                <View style={[styles.tabIconWrap, selected && styles.tabIconWrapActive]}>
                  <Ionicons
                    name={selected ? tab.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : tab.icon}
                    size={22}
                    color={selected ? palette.white : palette.textMuted}
                  />
                </View>
                <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
      <NotificationsModal visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <ChatModal visible={chatOpen} onClose={() => setChatOpen(false)} />
      <PushDiagnosticsModal visible={pushOpen} onClose={() => setPushOpen(false)} />
    </View>
  );
}

function AppHeader({ onOpenChat, onOpenNotifications }: { onOpenChat: () => void; onOpenNotifications: () => void }) {
  const { currentUser, activeRole, unreadNotifications } = useAppStore();
  const firstName = currentUser.fullName.split(' ')[0] || currentUser.fullName;
  return (
    <LinearGradient colors={gradients.brandDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
      <View style={styles.brandMark}>
        <Image source={require('../../assets/images/mover-icon.png')} style={styles.headerLogoImage} resizeMode="cover" />
      </View>
      <View style={styles.headerTextWrap}>
        <View style={styles.headerBrandLine}>
          <Text style={styles.brandName}>MARILAB MOVER</Text>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
        </View>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {roleLabels[activeRole]} · {firstName} · v1.8.1
        </Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable accessibilityLabel="Apri chat" onPress={onOpenChat} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={palette.white} />
        </Pressable>
        <Pressable accessibilityLabel="Apri notifiche" onPress={onOpenNotifications} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
          <Ionicons name="notifications-outline" size={22} color={palette.white} />
          {unreadNotifications ? (
            <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text></View>
          ) : null}
        </Pressable>
      </View>
    </LinearGradient>
  );
}


function DesktopSidebar({
  tabs,
  activeTab,
  onSelect,
  onOpenChat,
  onOpenNotifications,
  onOpenPush,
}: {
  tabs: TabItem[];
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
  onOpenChat: () => void;
  onOpenNotifications: () => void;
  onOpenPush: () => void;
}) {
  const { currentUser, activeRole, unreadNotifications, pushStatus, logout } = useAppStore();
  const initials = currentUser.fullName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const pushReady = pushStatus.state === 'ready';

  const confirmLogout = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Vuoi uscire da Marilab Mover?')) void logout();
      return;
    }
    Alert.alert('Esci da Marilab Mover', 'Vuoi terminare la sessione?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <LinearGradient colors={['#041C2C', '#073A54', '#08718D']} style={styles.desktopSidebar}>
      <ScrollView
        style={styles.desktopSidebarScroll}
        contentContainerStyle={styles.desktopSidebarContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled">
      <View style={styles.desktopBrandBlock}>
        <View style={styles.desktopLogoWrap}>
          <Image source={require('../../assets/images/mover-icon.png')} style={styles.desktopLogo} resizeMode="cover" />
        </View>
        <View>
          <Text style={styles.desktopBrandName}>MARILAB</Text>
          <Text style={styles.desktopBrandProduct}>MOVER</Text>
        </View>
      </View>

      <View style={styles.desktopWorkspaceBadge}>
        <View style={styles.desktopLiveDot} />
        <Text style={styles.desktopWorkspaceText}>AMBIENTE OPERATIVO</Text>
      </View>

      <View style={styles.desktopNav}>
        <Text style={styles.desktopNavLabel}>NAVIGAZIONE</Text>
        {tabs.map((tab) => {
          const selected = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelect(tab.key)}
              style={({ pressed }) => [styles.desktopNavItem, selected && styles.desktopNavItemActive, pressed && styles.desktopNavItemPressed]}>
              <View style={[styles.desktopNavIcon, selected && styles.desktopNavIconActive]}>
                <Ionicons name={selected ? tab.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : tab.icon} size={20} color={selected ? palette.brandDeep : 'rgba(255,255,255,0.76)'} />
              </View>
              <Text style={[styles.desktopNavText, selected && styles.desktopNavTextActive]}>{tab.label}</Text>
              {selected ? <Ionicons name="chevron-forward" size={17} color={palette.brandGlow} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.desktopUtilityNav}>
        <Text style={styles.desktopNavLabel}>COMUNICAZIONE</Text>
        <DesktopSidebarAction icon="chatbubble-ellipses-outline" label="Chat" detail="Generale, privata e consegne" onPress={onOpenChat} />
        <DesktopSidebarAction
          icon="notifications-outline"
          label="Notifiche"
          detail={unreadNotifications ? `${unreadNotifications} da leggere` : 'Tutto aggiornato'}
          badge={unreadNotifications || undefined}
          onPress={onOpenNotifications}
        />
        <DesktopSidebarAction
          icon={pushReady ? 'notifications-circle' : 'notifications-off-outline'}
          label="Notifiche push"
          detail={pushReady ? 'Attive su questo dispositivo' : 'Premi per attivarle'}
          tone={pushReady ? 'success' : 'warning'}
          onPress={onOpenPush}
        />
      </View>

      <View style={styles.desktopAccountArea}>
        <View style={styles.desktopUserCard}>
          <View style={styles.desktopAvatar}><Text style={styles.desktopAvatarText}>{initials || 'MM'}</Text></View>
          <View style={styles.desktopUserText}>
            <Text style={styles.desktopUserName} numberOfLines={1}>{currentUser.fullName}</Text>
            <Text style={styles.desktopUserRole}>{roleLabels[activeRole]}</Text>
          </View>
          <View style={styles.desktopOnlineDot} />
        </View>
        <Pressable onPress={confirmLogout} style={({ pressed }) => [styles.desktopLogoutButton, pressed && styles.desktopNavItemPressed]}>
          <Ionicons name="log-out-outline" size={20} color="#FFD8D8" />
          <Text style={styles.desktopLogoutText}>Logout</Text>
        </Pressable>
        <Text style={styles.desktopVersion}>Marilab Mover Enterprise · v1.8.1</Text>
      </View>
      </ScrollView>
    </LinearGradient>
  );
}

function DesktopSidebarAction({
  icon,
  label,
  detail,
  badge,
  tone = 'default',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  badge?: number;
  tone?: 'default' | 'success' | 'warning';
  onPress: () => void;
}) {
  const iconColor = tone === 'success' ? '#72EDB8' : tone === 'warning' ? '#FFD179' : palette.brandGlow;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.desktopUtilityItem, pressed && styles.desktopNavItemPressed]}>
      <View style={styles.desktopUtilityIcon}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View style={styles.desktopUtilityTextWrap}>
        <Text style={styles.desktopUtilityTitle}>{label}</Text>
        <Text style={styles.desktopUtilityDetail} numberOfLines={1}>{detail}</Text>
      </View>
      {badge ? <View style={styles.desktopUtilityBadge}><Text style={styles.desktopUtilityBadgeText}>{badge > 99 ? '99+' : badge}</Text></View> : <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.32)" />}
    </Pressable>
  );
}

function DesktopTopbar() {
  const { currentUser, activeRole, pushStatus } = useAppStore();
  const firstName = currentUser.fullName.split(' ')[0] || currentUser.fullName;
  const pushReady = pushStatus.state === 'ready';
  return (
    <View style={styles.desktopTopbar}>
      <View style={styles.desktopTopbarCopy}>
        <Text style={styles.desktopTopbarEyebrow}>MARILAB MOVER ENTERPRISE</Text>
        <Text style={styles.desktopTopbarTitle}>Buongiorno, {firstName}</Text>
        <Text style={styles.desktopTopbarSubtitle}>{roleLabels[activeRole]} · gestione operativa in tempo reale</Text>
      </View>
      <View style={styles.desktopTopbarActions}>
        <View style={styles.desktopStatusChip}><View style={styles.desktopStatusDot} /><Text style={styles.desktopStatusText}>Sistema operativo</Text></View>
        <View style={[styles.desktopPushChip, pushReady ? styles.desktopPushChipReady : styles.desktopPushChipWarning]}>
          <Ionicons name={pushReady ? 'notifications' : 'notifications-off-outline'} size={17} color={pushReady ? palette.success : palette.warning} />
          <Text style={[styles.desktopPushChipText, { color: pushReady ? palette.success : palette.warning }]}>{pushReady ? 'Push attive' : 'Push da attivare'}</Text>
        </View>
      </View>
    </View>
  );
}

function ScreenScroll({ children }: React.PropsWithChildren) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1100;
  const isWideDesktop = Platform.OS === 'web' && width >= 1600;
  return (
    <ScrollView
      style={styles.screenScroller}
      contentContainerStyle={[styles.screenScroll, isDesktopWeb && styles.screenScrollDesktop, isWideDesktop && styles.screenScrollWide]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

function ResponsiveGrid({
  children,
  minColumnWidth = 480,
  maxColumns = 3,
}: React.PropsWithChildren<{ minColumnWidth?: number; maxColumns?: number }>) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1100;
  const horizontalPadding = width >= 1600 ? 116 : 88;
  const availableWidth = Math.max(320, width - 280 - horizontalPadding);
  const columns = isDesktopWeb
    ? Math.max(1, Math.min(maxColumns, Math.floor((availableWidth + 24) / (minColumnWidth + 24))))
    : 1;
  const itemWidth = (isDesktopWeb
    ? `calc((100% - ${(columns - 1) * 24}px) / ${columns})`
    : '100%') as DimensionValue;

  return (
    <View style={[styles.responsiveGrid, isDesktopWeb && styles.responsiveGridDesktop]}>
      {React.Children.map(children, (child) => (
        <View style={[styles.responsiveGridItem, { width: itemWidth }]}>{child}</View>
      ))}
    </View>
  );
}

function PageIntro({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1100;
  return (
    <View style={[styles.pageIntro, isDesktopWeb && styles.pageIntroDesktop]}>
      <View style={[styles.eyebrowPill, isDesktopWeb && styles.eyebrowPillDesktop]}>
        <View style={styles.eyebrowDot} />
        <Text style={[styles.eyebrow, isDesktopWeb && styles.eyebrowDesktop]}>{eyebrow}</Text>
      </View>
      <Text style={[styles.pageTitle, isDesktopWeb && styles.pageTitleDesktop]}>{title}</Text>
      <Text style={[styles.pageSubtitle, isDesktopWeb && styles.pageSubtitleDesktop]}>{subtitle}</Text>
    </View>
  );
}

function RequesterHome({ onOpenRequests }: { onOpenRequests: () => void }) {
  const { requests, currentUser } = useAppStore();
  const [formOpen, setFormOpen] = useState(false);
  const today = todayIso();
  const myRequests = requests.filter((request) => request.requesterId === currentUser.id);
  const todayRequests = myRequests.filter((request) => request.requestedDate === today && request.status !== 'cancelled');
  const activeRequests = myRequests.filter((request) => !['completed', 'cancelled'].includes(request.status));

  return (
    <>
      <ScreenScroll>
        <PageIntro
          eyebrow="SEGRETERIA"
          title="Cosa devi organizzare?"
          subtitle="Inserisci una richiesta in pochi passaggi e controlla subito gli aggiornamenti."
        />

        <Pressable onPress={() => setFormOpen(true)} style={({ pressed }) => [styles.heroActionPressable, pressed && styles.pressed]}>
          <LinearGradient colors={[palette.brandBright, palette.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroAction}>
            <View style={styles.heroActionIcon}>
              <Ionicons name="add" size={30} color={palette.brand} />
            </View>
            <View style={styles.heroActionText}>
              <Text style={styles.heroActionTitle}>Nuova richiesta</Text>
              <Text style={styles.heroActionSubtitle}>Apparecchiatura, giorno, ora e destinazione</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={palette.white} />
          </LinearGradient>
        </Pressable>

        <View style={styles.symmetricGrid}>
          <QuickStat
            icon="today-outline"
            value={String(todayRequests.length)}
            label="Consegne oggi"
            onPress={onOpenRequests}
          />
          <QuickStat
            icon="time-outline"
            value={String(activeRequests.length)}
            label="Richieste attive"
            onPress={onOpenRequests}
          />
        </View>

        <SectionTitle title="Prossimi aggiornamenti" />
        {activeRequests.length ? (
          <ResponsiveGrid minColumnWidth={500} maxColumns={3}>
            {activeRequests
              .sort((a, b) => `${a.requestedDate}${a.requestedTime}`.localeCompare(`${b.requestedDate}${b.requestedTime}`))
              .slice(0, 6)
              .map((request) => <RequestCard key={request.id} request={request} compact />)}
          </ResponsiveGrid>
        ) : (
          <EmptyState
            icon="checkmark-circle-outline"
            title="Tutto organizzato"
            text="Non ci sono richieste aperte in questo momento."
          />
        )}
      </ScreenScroll>
      <NewRequestModal visible={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}

function QuickStat({
  icon,
  value,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickStat, pressed && styles.pressed]}>
      <View style={styles.quickStatIcon}>
        <Ionicons name={icon} size={23} color={palette.brand} />
      </View>
      <Text style={styles.quickStatValue}>{value}</Text>
      <Text style={styles.quickStatLabel}>{label}</Text>
    </Pressable>
  );
}

function MoverHome({ onOpenChat }: { onOpenChat: () => void }) {
  const { requests, currentUser, updateRequestStatus } = useAppStore();
  const [period, setPeriod] = useState<'today' | 'upcoming' | 'future'>('today');
  const [teamRequest, setTeamRequest] = useState<DeliveryRequest>();
  const today = todayIso();
  const lastCompletedRequest = useMemo(() => requests
    .filter((request) => request.status === 'completed' && request.assignedMoverIds.includes(currentUser.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0], [currentUser.id, requests]);
  const active = requests.filter((request) => !['completed', 'cancelled'].includes(request.status));
  const visible = active.filter((request) => {
    const isMine = request.assignedMoverIds.includes(currentUser.id);
    const isFree = request.assignedMoverIds.length === 0;
    if (!isMine && !isFree) return false;
    if (period === 'today') return request.requestedDate <= today;
    if (period === 'upcoming') return request.requestedDate > today && request.requestedDate <= addDaysIso(today, 7);
    return request.requestedDate > addDaysIso(today, 7);
  }).sort((a, b) => `${a.requestedDate}${a.requestedTime}`.localeCompare(`${b.requestedDate}${b.requestedTime}`));

  return (
    <>
      <ScreenScroll>
        <PageIntro
          eyebrow="MOVER"
          title="Missioni"
          subtitle="Scegli chi si sta muovendo, poi gestisci la consegna senza passaggi inutili."
        />
        <LastHandledEquipmentCard request={lastCompletedRequest} />
        <View style={styles.segmented}>
          {([['today', 'Oggi'], ['upcoming', 'Prossime'], ['future', 'Future']] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setPeriod(key)} style={[styles.segment, period === key && styles.segmentActive]}>
              <Text style={[styles.segmentText, period === key && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <RouteProgress requests={visible.filter((item) => item.assignedMoverIds.includes(currentUser.id))} />
        {visible.length ? (
          <ResponsiveGrid minColumnWidth={560} maxColumns={2}>
            {visible.map((request, index) => (
              <MoverTaskCard
                key={request.id}
                request={request}
                sequence={index + 1}
                onTake={() => setTeamRequest(request)}
                onOpenChat={onOpenChat}
                onStatusChange={(status) => {
                  void updateRequestStatus(request.id, status).then((result) => {
                    if (!result.ok) Alert.alert('Aggiornamento non riuscito', result.error);
                  });
                }}
              />
            ))}
          </ResponsiveGrid>
        ) : <EmptyState icon="navigate-outline" title="Nessuna missione" text="Non ci sono attività disponibili in questo periodo." />}
      </ScreenScroll>
      <MoverTeamModal request={teamRequest} visible={Boolean(teamRequest)} onClose={() => setTeamRequest(undefined)} />
    </>
  );
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function LastHandledEquipmentCard({ request }: { request?: DeliveryRequest }) {
  const { equipment, sites } = useAppStore();
  const item = request ? equipment.find((entry) => entry.id === request.equipmentId) : undefined;
  const destination = request ? sites.find((entry) => entry.id === request.destinationSiteId) : undefined;

  return (
    <Card style={styles.lastEquipmentCard}>
      <View style={styles.lastEquipmentHeader}>
        <View style={styles.lastEquipmentIcon}>
          <Ionicons name="cube-outline" size={24} color={palette.brand} />
        </View>
        <View style={styles.lastEquipmentHeaderText}>
          <Text style={styles.lastEquipmentEyebrow}>ULTIMO STRUMENTO CONSEGNATO</Text>
          <Text style={styles.lastEquipmentTitle}>{item?.name ?? 'Nessuna consegna completata'}</Text>
          {item ? <Text style={styles.lastEquipmentCode}>{item.inventoryCode}</Text> : null}
        </View>
      </View>
      {request ? (
        <View style={styles.lastEquipmentLocation}>
          <Ionicons name="location-outline" size={20} color={palette.success} />
          <View style={styles.lastEquipmentLocationText}>
            <Text style={styles.lastEquipmentLocationLabel}>POSIZIONE ATTUALE</Text>
            <Text style={styles.lastEquipmentLocationValue}>{destination?.shortName ?? 'Sede non disponibile'}</Text>
            <Text style={styles.lastEquipmentMeta}>Ultima consegna: {formatDate(request.requestedDate)} alle {request.requestedTime}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.lastEquipmentEmpty}>Quando completi una consegna, qui resteranno sempre visibili lo strumento e la sede in cui è stato lasciato.</Text>
      )}
    </Card>
  );
}

function RouteProgress({ requests }: { requests: DeliveryRequest[] }) {
  const completed = requests.filter((item) => item.status === 'completed').length;
  const progress = requests.length ? completed / requests.length : 0;
  return (
    <Card style={styles.progressCard}>
      <View style={styles.progressTop}>
        <Text style={styles.progressTitle}>Avanzamento giro</Text>
        <Text style={styles.progressValue}>{completed}/{requests.length}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </Card>
  );
}

function MoverTaskCard({
  request,
  sequence,
  onStatusChange,
  onTake,
  onOpenChat,
}: {
  request: DeliveryRequest;
  sequence: number;
  onStatusChange: (status: RequestStatus) => void;
  onTake: () => void;
  onOpenChat: () => void;
}) {
  const { equipment, sites, users, currentUser } = useAppStore();
  const item = equipment.find((entry) => entry.id === request.equipmentId);
  const pickup = sites.find((entry) => entry.id === request.pickupSiteId);
  const destination = sites.find((entry) => entry.id === request.destinationSiteId);
  const next = nextMoverAction(request);
  const moverNames = request.assignedMoverIds.map((id) => users.find((entry) => entry.id === id)?.fullName).filter(Boolean).join(' e ');
  const isMine = request.assignedMoverIds.includes(currentUser.id);

  return (
    <Card style={styles.taskCard}>
      <View style={styles.taskHeader}>
        <View style={styles.sequenceBadge}><Text style={styles.sequenceText}>{sequence}</Text></View>
        <View style={styles.taskHeaderText}>
          <Text style={styles.taskTime}>{request.requestedTime}</Text>
          <Text style={styles.taskEquipment}>{item?.name ?? 'Apparecchiatura'}</Text>
        </View>
        <StatusPill status={request.status} />
      </View>

      <View style={styles.routeLine}>
        <View style={styles.routeDots}>
          <View style={styles.routeDot} />
          <View style={styles.routeConnector} />
          <View style={[styles.routeDot, styles.routeDotEnd]} />
        </View>
        <View style={styles.routeTexts}>
          <View>
            <Text style={styles.routeLabel}>RITIRO</Text>
            <Text style={styles.routePlace}>{pickup?.shortName}</Text>
            <Text style={styles.routeAddress}>{pickup?.address}</Text>
          </View>
          <View>
            <Text style={styles.routeLabel}>CONSEGNA</Text>
            <Text style={styles.routePlace}>{destination?.shortName}</Text>
            <Text style={styles.routeAddress}>{destination?.address}</Text>
          </View>
        </View>
      </View>

      <View style={styles.mapsPanel}>
        <View style={styles.mapsInfo}>
          <View style={styles.mapsIcon}><Ionicons name="map-outline" size={20} color={palette.brand} /></View>
          <View style={styles.mapsTextWrap}>
            <Text style={styles.mapsTitle}>Percorso e traffico</Text>
            <Text style={styles.mapsSubtitle}>Tempi aggiornati direttamente in Google Maps</Text>
          </View>
        </View>
        <AppButton
          label="Apri Google Maps"
          icon="navigate-outline"
          variant="secondary"
          compact
          onPress={() => openGoogleMapsRoute(pickup?.mapsQuery ?? pickup?.address, destination?.mapsQuery ?? destination?.address)}
        />
      </View>

      <View style={styles.teamSummary}>
        <Ionicons name="people-outline" size={19} color={palette.teal} />
        <Text style={styles.teamSummaryText}>{moverNames ? `In consegna con: ${moverNames}` : 'Consegna disponibile'}</Text>
      </View>

      {request.note ? (
        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={22} color={palette.warning} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.noteLabel}>ISTRUZIONI</Text>
            <Text style={styles.noteText}>{request.note}</Text>
          </View>
        </View>
      ) : null}

      <Pressable accessibilityLabel="Apri chat della consegna" onPress={onOpenChat} style={({ pressed }) => [styles.missionChatButton, pressed && styles.pressed]}>
        <View style={styles.missionChatIcon}><Ionicons name="chatbubble-ellipses" size={24} color={palette.white} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.missionChatTitle}>Chat della consegna</Text>
          <Text style={styles.missionChatSubtitle}>Messaggi e aggiornamenti operativi</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={palette.brand} />
      </Pressable>

      {!request.assignedMoverIds.length ? (
        <AppButton label="Prendi in carico" icon="people-outline" onPress={onTake} />
      ) : next && isMine ? (
        <AppButton label={next.label} icon={next.icon} onPress={() => onStatusChange(next.status)} />
      ) : (
        <AppButton label="Consegna chiusa" icon="checkmark-circle" variant="secondary" disabled onPress={() => undefined} />
      )}
    </Card>
  );
}

async function openGoogleMapsRoute(origin?: string, destination?: string) {
  if (!origin || !destination) {
    Alert.alert('Percorso non disponibile', 'Controlla gli indirizzi delle sedi.');
    return;
  }
  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Google Maps non disponibile', 'Non è stato possibile aprire il percorso.');
  }
}

function nextMoverAction(request: DeliveryRequest): {
  label: string;
  status: RequestStatus;
  icon: keyof typeof Ionicons.glyphMap;
} | null {
  if (['pending', 'assigned', 'picked_up', 'in_transit', 'delivered'].includes(request.status)) {
    return { label: 'Segna come consegnato', status: 'completed', icon: 'checkmark-done-outline' };
  }
  return null;
}

function AdminHome({ onOpenRequests }: { onOpenRequests: () => void }) {
  const { requests, currentUser } = useAppStore();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1100;
  const today = todayIso();
  const available = requests.filter((request) => request.assignedMoverIds.length === 0 && !['completed', 'cancelled'].includes(request.status));
  const todayRequests = requests.filter((request) => request.requestedDate === today && request.status !== 'cancelled');
  const urgent = requests.filter((request) => request.priority === 'urgent' && !['completed', 'cancelled'].includes(request.status));
  const travelling = requests.filter((request) => request.status === 'in_transit');
  const completedToday = todayRequests.filter((request) => request.status === 'completed').length;
  const firstName = currentUser.fullName.split(' ')[0] || currentUser.fullName;
  const hour = new Date().getHours();
  const greeting = hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';

  return (
    <ScreenScroll>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.adminHero}>
        <View style={styles.adminHeroTop}>
          <View style={styles.adminHeroCopy}>
            <Text style={styles.adminHeroEyebrow}>PANORAMICA OPERATIVA</Text>
            <Text style={styles.adminHeroTitle}>{greeting}, {firstName}</Text>
            <Text style={styles.adminHeroSubtitle}>Tutto ciò che serve per coordinare le consegne di oggi.</Text>
          </View>
          <View style={styles.adminHeroPulse}>
            <View style={styles.adminHeroPulseDot} />
            <Text style={styles.adminHeroPulseText}>Sistema attivo</Text>
          </View>
        </View>
        <View style={styles.adminHeroSummary}>
          <View style={styles.adminHeroSummaryItem}>
            <Text style={styles.adminHeroSummaryValue}>{todayRequests.length}</Text>
            <Text style={styles.adminHeroSummaryLabel}>programmate</Text>
          </View>
          <View style={styles.adminHeroDivider} />
          <View style={styles.adminHeroSummaryItem}>
            <Text style={styles.adminHeroSummaryValue}>{completedToday}</Text>
            <Text style={styles.adminHeroSummaryLabel}>chiuse oggi</Text>
          </View>
          <View style={styles.adminHeroDivider} />
          <View style={styles.adminHeroSummaryItem}>
            <Text style={styles.adminHeroSummaryValue}>{available.length}</Text>
            <Text style={styles.adminHeroSummaryLabel}>da assegnare</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.dashboardSectionHeader}>
        <View>
          <Text style={styles.dashboardSectionEyebrow}>TEMPO REALE</Text>
          <Text style={styles.dashboardSectionTitle}>Stato operativo</Text>
        </View>
        <View style={styles.versionChip}><Text style={styles.versionChipText}>v1.8.1</Text></View>
      </View>
      <View style={[styles.adminMetrics, isDesktopWeb && styles.adminMetricsDesktop]}>
        <AdminMetric desktop={isDesktopWeb} icon="calendar-clear-outline" value={todayRequests.length} label="Consegne oggi" tone="brand" />
        <AdminMetric desktop={isDesktopWeb} icon="person-add-outline" value={available.length} label="Da assegnare" tone="warning" />
        <AdminMetric desktop={isDesktopWeb} icon="navigate-outline" value={travelling.length} label="In viaggio" tone="success" />
        <AdminMetric desktop={isDesktopWeb} icon="flash-outline" value={urgent.length} label="Urgenti" tone="danger" />
      </View>
      <OperationsLegend />
      <SectionTitle title="Attività recenti" action={available.length ? `${available.length} da prendere` : undefined} />
      {requests.length ? (
        <ResponsiveGrid minColumnWidth={520} maxColumns={2}>
          {requests.slice(0, 6).map((request) => <RequestCard key={request.id} request={request} compact />)}
        </ResponsiveGrid>
      ) : (
        <EmptyState icon="pulse-outline" title="Nessuna attività" text="Le nuove richieste compariranno qui in tempo reale." />
      )}
      <AppButton label="Vedi tutte le consegne" icon="arrow-forward-outline" variant="secondary" onPress={onOpenRequests} />
    </ScreenScroll>
  );
}

function OperationsLegend() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1100;
  const items = [
    { label: 'Operativo', detail: 'Consegnato o disponibile', color: palette.success, soft: palette.successSoft },
    { label: 'Attenzione', detail: 'Da prendere in carico', color: palette.warning, soft: palette.warningSoft },
    { label: 'Critico', detail: 'Urgente, ritardo o annullamento', color: palette.danger, soft: palette.dangerSoft },
    { label: 'In corso', detail: 'Assegnato, ritirato o in viaggio', color: palette.info, soft: palette.infoSoft },
  ];
  return (
    <Card style={styles.legendCard}>
      <View style={styles.legendHeader}>
        <Text style={styles.legendTitle}>Semaforo operativo</Text>
        <Text style={styles.legendHint}>lettura immediata</Text>
      </View>
      <View style={styles.legendGrid}>
        {items.map((item) => (
          <View key={item.label} style={[styles.legendItem, isDesktopWeb && styles.legendItemDesktop, { backgroundColor: item.soft }]}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <View style={styles.legendTextWrap}>
              <Text style={[styles.legendLabel, { color: item.color }]}>{item.label}</Text>
              <Text style={styles.legendDetail}>{item.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function AdminMetric({
  icon,
  value,
  label,
  tone,
  desktop = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  tone: 'brand' | 'warning' | 'danger' | 'success';
  desktop?: boolean;
}) {
  const toneStyle = {
    brand: styles.metricBrand,
    warning: styles.metricWarning,
    danger: styles.metricDanger,
    success: styles.metricSuccess,
  }[tone];
  const toneColor = {
    brand: palette.brand,
    warning: palette.warning,
    danger: palette.danger,
    success: palette.success,
  }[tone];
  return (
    <Card style={[styles.metricCard, desktop && styles.metricCardDesktop]}>
      <View style={styles.metricTopLine}>
        <View style={[styles.metricIcon, toneStyle]}><Ionicons name={icon} size={20} color={toneColor} /></View>
        <View style={[styles.metricSignal, { backgroundColor: toneColor }]} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

function RequestsScreen() {
  const { activeRole, requests } = useAppStore();
  const [filter, setFilter] = useState<'active' | 'today' | 'all'>('active');
  const [formOpen, setFormOpen] = useState(false);

  const visibleRequests = useMemo(() => {
    let list = [...requests];
    if (filter === 'active') list = list.filter((request) => !['completed', 'cancelled'].includes(request.status));
    if (filter === 'today') list = list.filter((request) => request.requestedDate === todayIso());
    return list.sort((a, b) => `${a.requestedDate}${a.requestedTime}`.localeCompare(`${b.requestedDate}${b.requestedTime}`));
  }, [filter, requests]);

  return (
    <>
      <ScreenScroll>
        <PageIntro
          eyebrow={activeRole === 'admin' ? 'CONSEGNE' : 'ATTIVITÀ'}
          title={activeRole === 'requester' ? 'Le mie richieste' : activeRole === 'mover' ? 'Le mie attività' : 'Tutte le consegne'}
          subtitle="La situazione è visibile a tutti; i ruoli limitano soltanto le azioni consentite."
        />
        <View style={styles.sharedVisibilityBanner}>
          <Ionicons name="eye-outline" size={19} color={palette.brand} />
          <Text style={styles.sharedVisibilityText}>Aggiornamenti, promemoria e consegne sono condivisi con tutti gli utenti attivi.</Text>
        </View>
        <View style={styles.segmented}>
          {([
            ['active', 'Attive'],
            ['today', 'Oggi'],
            ['all', 'Tutte'],
          ] as const).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.segment, filter === key && styles.segmentActive]}>
              <Text style={[styles.segmentText, filter === key && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {activeRole === 'requester' ? (
          <AppButton label="Nuova richiesta" icon="add" onPress={() => setFormOpen(true)} />
        ) : null}

        {visibleRequests.length ? (
          <ResponsiveGrid minColumnWidth={500} maxColumns={3}>
            {visibleRequests.map((request) => <RequestCard key={request.id} request={request} />)}
          </ResponsiveGrid>
        ) : (
          <EmptyState icon="file-tray-outline" title="Nessuna attività" text="Non ci sono richieste corrispondenti al filtro selezionato." />
        )}
      </ScreenScroll>
      <NewRequestModal visible={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}

function isRequestLate(request: DeliveryRequest) {
  if (['delivered', 'completed', 'cancelled'].includes(request.status)) return false;
  const due = new Date(`${request.requestedDate}T${request.requestedTime}:00`);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}

function RequestCard({ request, compact = false }: { request: DeliveryRequest; compact?: boolean }) {
  const { equipment, sites, users, currentUser, deleteRequest } = useAppStore();
  const item = equipment.find((entry) => entry.id === request.equipmentId);
  const pickup = sites.find((entry) => entry.id === request.pickupSiteId);
  const destination = sites.find((entry) => entry.id === request.destinationSiteId);
  const moverNames = request.assignedMoverIds.map((id) => users.find((entry) => entry.id === id)?.fullName).filter(Boolean).join(' e ');
  const requester = users.find((entry) => entry.id === request.requesterId);
  const late = isRequestLate(request);
  const canDelete = currentUser.role === 'admin';

  const removeClosedRequest = async () => {
    const result = await deleteRequest(request.id);
    if (!result.ok) {
      const message = result.error ?? 'Eliminazione non riuscita.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Eliminazione non riuscita', message);
    }
  };

  const confirmDelete = () => {
    const detail = `${request.code} (${statusLabels[request.status]}) verrà rimossa definitivamente con storico stati, assegnazioni, notifiche e chat collegate.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(`Eliminare richiesta o consegna?\n\n${detail}`)) return;
      if (window.confirm('Conferma definitiva\n\nQuesta operazione non può essere annullata.')) void removeClosedRequest();
      return;
    }

    Alert.alert('Eliminare richiesta o consegna?', detail, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Continua',
        style: 'destructive',
        onPress: () => Alert.alert('Conferma definitiva', 'Questa operazione non può essere annullata.', [
          { text: 'No', style: 'cancel' },
          { text: 'Elimina definitivamente', style: 'destructive', onPress: () => void removeClosedRequest() },
        ]),
      },
    ]);
  };

  return (
    <Card style={styles.requestCard}>
      <View style={styles.requestTopRow}>
        <View style={styles.requestTitleWrap}>
          <Text style={styles.requestCode}>{request.code}</Text>
          <Text style={styles.requestTitle}>{item?.name ?? 'Apparecchiatura'}</Text>
        </View>
        <View style={styles.requestStatusWrap}>
          {late ? <View style={styles.lateBadge}><View style={styles.lateDot} /><Text style={styles.lateText}>In ritardo</Text></View> : null}
          <StatusPill status={request.status} />
        </View>
      </View>
      <View style={styles.requestMainInfo}>
        <View style={styles.dateBox}>
          <Ionicons name="calendar-outline" size={20} color={palette.brand} />
          <Text style={styles.dateBoxText}>{formatDate(request.requestedDate)}</Text>
          <Text style={styles.dateBoxTime}>{request.requestedTime}</Text>
        </View>
        <View style={styles.requestRouteText}>
          <Text style={styles.requestRoute}>{pickup?.shortName} → {destination?.shortName}</Text>
          <Text style={styles.requestMeta} numberOfLines={compact ? 1 : 2}>
            {`${requester?.fullName ?? 'Richiedente'} · ${moverNames ? `In consegna con: ${moverNames}` : 'Disponibile per i Mover'}`}
          </Text>
        </View>
        {request.priority === 'urgent' ? (
          <View style={styles.urgentIcon}><Ionicons name="alert" size={18} color={palette.danger} /></View>
        ) : null}
      </View>
      {!compact && request.note ? <Text style={styles.requestNote}>{request.note}</Text> : null}
      {!compact && canDelete ? (
        <Pressable onPress={confirmDelete} style={styles.deleteClosedButton}>
          <Ionicons name="trash-outline" size={17} color={palette.danger} />
          <Text style={styles.deleteClosedText}>Elimina richiesta o consegna</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

function InventoryScreen() {
  const { equipment, sites, requests, currentUser } = useAppStore();
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Equipment>();
  const filtered = equipment.filter((item) =>
    `${item.name} ${item.inventoryCode} ${item.brand ?? ''} ${item.model ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );

  const openEditor = (item?: Equipment) => {
    setEditingItem(item);
    setEditorOpen(true);
  };

  return (
    <>
      <ScreenScroll>
        <PageIntro eyebrow="INVENTARIO LOGISTICO" title="Apparecchiature mobili" subtitle="Solo gli strumenti utili a Marilab Mover, separati da FMED." />
        {currentUser.role === 'admin' ? <AppButton label="Aggiungi strumento" icon="add-circle-outline" onPress={() => openEditor()} /> : null}
        <AppInput label="Cerca" placeholder="Nome o numero inventario" value={query} onChangeText={setQuery} />
        <ResponsiveGrid minColumnWidth={430} maxColumns={3}>
          {filtered.map((item) => {
            const site = sites.find((entry) => entry.id === item.currentSiteId);
            const activeRequest = requests.find(
              (request) => request.equipmentId === item.id && !['completed', 'cancelled'].includes(request.status),
            );
            return <EquipmentCard key={item.id} item={item} siteName={site?.shortName ?? '-'} activeRequest={activeRequest} onEdit={currentUser.role === 'admin' ? () => openEditor(item) : undefined} />;
          })}
        </ResponsiveGrid>
      </ScreenScroll>
      <EquipmentEditorModal visible={editorOpen} item={editingItem} onClose={() => { setEditorOpen(false); setEditingItem(undefined); }} />
    </>
  );
}

function EquipmentCard({
  item,
  siteName,
  activeRequest,
  onEdit,
}: {
  item: Equipment;
  siteName: string;
  activeRequest?: DeliveryRequest;
  onEdit?: () => void;
}) {
  const availability = !item.active ? 'Disattivata' : activeRequest ? 'Prenotata' : item.movable ? 'Disponibile' : 'Non movimentabile';
  return (
    <Card style={[styles.equipmentCard, !item.active && styles.equipmentCardInactive]}>
      <View style={styles.equipmentIcon}><Ionicons name="cube-outline" size={26} color={palette.brand} /></View>
      <View style={styles.equipmentText}>
        <Text style={styles.equipmentName}>{item.name}</Text>
        <Text style={styles.equipmentCode}>{item.inventoryCode}{item.brand ? ` · ${item.brand}` : ''}</Text>
        <View style={styles.locationLine}>
          <Ionicons name="location-outline" size={16} color={palette.textMuted} />
          <Text style={styles.locationText}>{siteName}</Text>
        </View>
      </View>
      <View style={styles.equipmentRight}>
        <View style={[styles.availabilityBadge, (!item.active || !item.movable) ? styles.availabilityOff : activeRequest ? styles.availabilityBusy : styles.availabilityFree]}>
          <Text style={styles.availabilityText}>{availability}</Text>
        </View>
        {onEdit ? <Pressable accessibilityLabel="Modifica strumento" onPress={onEdit} style={styles.equipmentEdit}><Ionicons name="create-outline" size={20} color={palette.brand} /></Pressable> : null}
      </View>
    </Card>
  );
}

function ProfileScreen({ onRoleChanged: _onRoleChanged }: { onRoleChanged: () => void }) {
  const { activeRole, currentUser, backendError, refreshing, refreshAll, logout, pushStatus } = useAppStore();
  const [usersOpen, setUsersOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [sitesOpen, setSitesOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);

  return (
    <>
      <ScreenScroll>
        <PageIntro eyebrow={roleLabels[activeRole].toUpperCase()} title={currentUser.fullName} subtitle={currentUser.email} />
        <Card style={styles.profileCard}>
          <View style={styles.profileAvatar}><Text style={styles.profileInitials}>{initials(currentUser.fullName)}</Text></View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{currentUser.fullName}</Text>
            <Text style={styles.profileRole}>{roleLabels[activeRole]}</Text>
          </View>
        </Card>

        {backendError ? (
          <Card style={styles.backendWarningCard}>
            <Ionicons name="alert-circle-outline" size={22} color={palette.warning} />
            <View style={styles.managementText}>
              <Text style={styles.managementTitle}>Verifica configurazione</Text>
              <Text style={styles.managementSubtitle}>{backendError}</Text>
            </View>
          </Card>
        ) : null}

        <SectionTitle title={activeRole === 'admin' ? 'Gestione sistema' : 'Impostazioni'} />
        {activeRole === 'admin' ? (
          <ResponsiveGrid minColumnWidth={420} maxColumns={2}>
            <ManagementRow icon="people-outline" title="Utenti e ruoli" subtitle="Crea account, assegna ruoli e reimposta password" onPress={() => setUsersOpen(true)} />
            <ManagementRow icon="stats-chart-outline" title="Statistiche" subtitle="Consegne per sede, asset, Mover, periodo e stato" onPress={() => setStatisticsOpen(true)} />
            <ManagementRow icon="business-outline" title="Sedi e Google Maps" subtitle="Indirizzi, referenti e navigazione" onPress={() => setSitesOpen(true)} />
            <ManagementRow icon="notifications-outline" title="Notifiche push" subtitle={pushStatus.message} onPress={() => setPushOpen(true)} />
            <ManagementRow icon="chatbubble-ellipses-outline" title="Chat testuale" subtitle="Messaggi generali, privati e per singola consegna" />
          </ResponsiveGrid>
        ) : (
          <ResponsiveGrid minColumnWidth={420} maxColumns={2}>
            <ManagementRow icon="notifications-outline" title="Notifiche push" subtitle={pushStatus.message} onPress={() => setPushOpen(true)} />
            <ManagementRow icon="chatbubble-ellipses-outline" title="Chat testuale" subtitle="Comunicazione rapida con tutti gli utenti" />
          </ResponsiveGrid>
        )}

        <SectionTitle title="Sicurezza account" />
        <ManagementRow icon="key-outline" title="Cambia password" subtitle="Disponibile per tutti gli utenti" onPress={() => setPasswordOpen(true)} />

        <SectionTitle title="Informazioni" />
        <Card style={styles.aboutCard}>
          <View style={styles.managementIcon}><Ionicons name="information-circle-outline" size={22} color={palette.brand} /></View>
          <View style={styles.managementText}>
            <Text style={styles.managementTitle}>Marilab Mover 1.8.1 · HD Web + Push Browser</Text>
            <Text style={styles.managementSubtitle}>Autore: Fabio Carratù · Progetto Supabase indipendente da FMED</Text>
          </View>
        </Card>
        <AppButton label={refreshing ? "Aggiornamento…" : "Aggiorna dati"} icon="refresh-outline" variant="secondary" disabled={refreshing} onPress={() => void refreshAll()} />

        <SectionTitle title="Account" />
        <AppButton label="Esci da Marilab Mover" icon="log-out-outline" variant="ghost" onPress={() => void logout()} />
      </ScreenScroll>
      <UserManagementModal visible={usersOpen} onClose={() => setUsersOpen(false)} />
      <StatisticsModal visible={statisticsOpen} onClose={() => setStatisticsOpen(false)} />
      <SiteManagementModal visible={sitesOpen} onClose={() => setSitesOpen(false)} />
      <PasswordChangeModal visible={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <PushDiagnosticsModal visible={pushOpen} onClose={() => setPushOpen(false)} />
    </>
  );
}

function ManagementRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  const content = (
    <Card style={styles.managementRow}>
      <View style={styles.managementIcon}><Ionicons name={icon} size={22} color={palette.brand} /></View>
      <View style={styles.managementText}><Text style={styles.managementTitle}>{title}</Text><Text style={styles.managementSubtitle}>{subtitle}</Text></View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={palette.textMuted} /> : null}
    </Card>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable>;
}


function PasswordChangeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { changeOwnPassword } = useAppStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ripulisce i campi quando il modal viene chiuso.
      setPassword('');
      setConfirm('');
      setError('');
      setSuccess('');
    }
  }, [visible]);

  const save = async () => {
    setError('');
    setSuccess('');
    if (password !== confirm) {
      setError('Le password non coincidono.');
      return;
    }
    setSaving(true);
    const result = await changeOwnPassword(password);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Modifica non riuscita.');
      return;
    }
    setSuccess('Password aggiornata correttamente.');
    setPassword('');
    setConfirm('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalHeaderButton}><Ionicons name="close" size={25} color={palette.text} /></Pressable>
          <View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>Cambia password</Text><Text style={styles.modalSubtitle}>Funzione disponibile a tutti gli utenti</Text></View>
          <View style={styles.modalHeaderSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.simpleModalScroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.simpleModalCard}>
            <View style={styles.securityIcon}><Ionicons name="key-outline" size={30} color={palette.brand} /></View>
            <Text style={styles.simpleModalTitle}>Nuova password</Text>
            <Text style={styles.simpleModalText}>Usa almeno 8 caratteri. La password è personale e non viene mostrata agli Admin.</Text>
            <AppInput label="Nuova password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Almeno 8 caratteri" />
            <AppInput label="Conferma password" secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Ripeti la password" />
            {error ? <Text style={styles.statisticsError}>{error}</Text> : null}
            {success ? <Text style={styles.successMessage}>{success}</Text> : null}
            <AppButton label={saving ? 'Salvataggio…' : 'Aggiorna password'} icon="checkmark-circle-outline" disabled={saving} onPress={() => void save()} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PushDiagnosticsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { currentUser, pushStatus, retryPushRegistration, loadPushDiagnostics, sendPushTest } = useAppStore();
  const [diagnostics, setDiagnostics] = useState<PushAdminDiagnostics>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (currentUser.role !== 'admin') return;
    const result = await loadPushDiagnostics();
    if (result.error) setError(result.error);
    else setDiagnostics(result.data);
  };

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carica i dati all'apertura del modal.
      void load();
    }
  // load dipende da filtri/stato del modal ed è richiamato intenzionalmente solo al cambio di visibilità.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const retry = async () => {
    setBusy(true);
    setError('');
    await retryPushRegistration();
    await load();
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    setError('');
    const result = await sendPushTest();
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'Test non riuscito.');
    else Alert.alert('Test inviato', result.message ?? (Platform.OS === 'web' ? 'Controlla le notifiche del browser o della PWA installata.' : 'Controlla il centro notifiche e la barra notifiche Android.'));
  };

  const tone = pushStatus.state === 'ready'
    ? palette.success
    : pushStatus.state === 'checking' || pushStatus.state === 'idle' || pushStatus.state === 'unsupported'
      ? palette.warning
      : palette.danger;
  const isWebPush = Platform.OS === 'web';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalHeaderButton}><Ionicons name="close" size={25} color={palette.text} /></Pressable>
          <View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>Notifiche push</Text><Text style={styles.modalSubtitle}>{isWebPush ? 'PC, Android PWA e iPhone Home Screen' : 'Android e iOS installati · test reale'}</Text></View>
          <Pressable onPress={() => void retry()} style={styles.modalHeaderButton}><Ionicons name="refresh-outline" size={23} color={palette.brand} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.simpleModalScroll}>
          <Card style={styles.simpleModalCard}>
            <View style={[styles.pushStateIcon, { backgroundColor: `${tone}20` }]}><Ionicons name="notifications-outline" size={30} color={tone} /></View>
            <Text style={styles.simpleModalTitle}>{pushStatus.state === 'ready' ? 'Push operative' : pushStatus.state === 'checking' ? 'Verifica in corso' : 'Push da attivare'}</Text>
            <Text style={styles.simpleModalText}>{pushStatus.message}</Text>
            {pushStatus.tokenPreview ? <Text selectable style={styles.tokenPreview}>{pushStatus.tokenPreview}</Text> : null}
            <View style={styles.twoColumns}>
              <View style={styles.flexField}><AppButton label={busy ? 'Verifica…' : 'Attiva su questo dispositivo'} icon={isWebPush ? 'desktop-outline' : 'phone-portrait-outline'} variant="secondary" disabled={busy} onPress={() => void retry()} /></View>
              <View style={styles.flexField}><AppButton label="Invia test" icon="paper-plane-outline" disabled={busy || pushStatus.state !== 'ready'} onPress={() => void test()} /></View>
            </View>
          </Card>

          {isWebPush ? (
            <Card style={styles.webPushHelpCard}>
              <View style={styles.webPushHelpHeader}>
                <Ionicons name="information-circle-outline" size={22} color={palette.brand} />
                <Text style={styles.webPushHelpTitle}>Installazione web consigliata</Text>
              </View>
              <Text style={styles.webPushHelpText}>PC e Android: apri il sito Vercel con Chrome o Edge, installa Marilab Mover e consenti le notifiche.</Text>
              <Text style={styles.webPushHelpText}>iPhone: aggiungi il sito alla schermata Home, aprilo dalla nuova icona e poi premi “Attiva su questo dispositivo”.</Text>
            </Card>
          ) : null}

          {currentUser.role === 'admin' && diagnostics ? (
            <Card style={styles.simpleModalCard}>
              <Text style={styles.simpleModalTitle}>Copertura dispositivi</Text>
              <View style={styles.pushMetricRow}>
                <View style={styles.pushMetric}><Text style={styles.pushMetricValue}>{diagnostics.activeUsers}</Text><Text style={styles.pushMetricLabel}>Utenti attivi</Text></View>
                <View style={styles.pushMetric}><Text style={styles.pushMetricValue}>{diagnostics.nativeTokens}</Text><Text style={styles.pushMetricLabel}>APK Android</Text></View>
                <View style={styles.pushMetric}><Text style={styles.pushMetricValue}>{diagnostics.webSubscriptions}</Text><Text style={styles.pushMetricLabel}>Web / PWA</Text></View>
                <View style={styles.pushMetric}><Text style={styles.pushMetricValue}>{diagnostics.activeTokens}</Text><Text style={styles.pushMetricLabel}>Totale dispositivi</Text></View>
              </View>
              <Text style={styles.simpleModalText}>Coda in verifica: {diagnostics.pendingDeliveries} · Errori/endpoint revocati ultime 24 ore: {diagnostics.failedDeliveries24h}</Text>
              {diagnostics.usersWithoutToken.length ? (
                <>
                  <Text style={styles.pushMissingTitle}>Utenti senza dispositivo push</Text>
                  {diagnostics.usersWithoutToken.map((user) => <Text key={user.id} style={styles.pushMissingUser}>• {user.fullName} · {user.email}</Text>)}
                </>
              ) : <Text style={styles.successMessage}>Tutti gli utenti attivi hanno almeno un dispositivo registrato.</Text>}
            </Card>
          ) : null}
          {error ? <Text style={styles.statisticsError}>{error}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function StatisticsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { sites, equipment, users, loadAdminStatistics } = useAppStore();
  const [filters, setFilters] = useState<StatisticsFilters>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { fromDate: formatItalianInputDate(from.toISOString().slice(0, 10)), toDate: formatItalianInputDate(to.toISOString().slice(0, 10)) };
  });
  const [data, setData] = useState<AdminStatistics>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<'site' | 'equipment' | 'mover' | null>(null);

  const load = async () => {
    setError('');
    const parsedFromDate = filters.fromDate ? parseItalianInputDate(filters.fromDate) : undefined;
    const parsedToDate = filters.toDate ? parseItalianInputDate(filters.toDate) : undefined;
    if (filters.fromDate && !parsedFromDate) {
      setError('Inserisci la data iniziale come GG/MM/AAAA.');
      return;
    }
    if (filters.toDate && !parsedToDate) {
      setError('Inserisci la data finale come GG/MM/AAAA.');
      return;
    }
    if (parsedFromDate && parsedToDate && parsedFromDate > parsedToDate) {
      setError('La data iniziale non può essere successiva alla data finale.');
      return;
    }
    setLoading(true);
    const result = await loadAdminStatistics({ ...filters, fromDate: parsedFromDate ?? undefined, toDate: parsedToDate ?? undefined });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setData(result.data);
  };

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carica i dati all'apertura del modal.
      void load();
    }
  // load dipende da filtri/stato del modal ed è richiamato intenzionalmente solo al cambio di visibilità.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const selectedSite = sites.find((item) => item.id === filters.siteId);
  const selectedEquipment = equipment.find((item) => item.id === filters.equipmentId);
  const selectedMover = users.find((item) => item.id === filters.moverId);
  const pickerOptions = picker === 'site'
    ? [{ id: 'all', label: 'Tutte le sedi', icon: 'business-outline' as const }, ...sites.map((item) => ({ id: item.id, label: item.shortName, subtitle: item.address, icon: 'location-outline' as const }))]
    : picker === 'equipment'
      ? [{ id: 'all', label: 'Tutti gli asset', icon: 'cube-outline' as const }, ...equipment.map((item) => ({ id: item.id, label: item.name, subtitle: item.inventoryCode, icon: 'cube-outline' as const }))]
      : [{ id: 'all', label: 'Tutti i Mover', icon: 'people-outline' as const }, ...users.filter((item) => item.role === 'mover').map((item) => ({ id: item.id, label: item.fullName, icon: 'navigate-outline' as const }))];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalHeaderButton}><Ionicons name="close" size={25} color={palette.text} /></Pressable>
          <View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>Statistiche Admin</Text><Text style={styles.modalSubtitle}>Analisi consegne e utilizzo asset</Text></View>
          <Pressable onPress={() => void load()} style={styles.modalHeaderButton}><Ionicons name="refresh-outline" size={23} color={palette.brand} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.statisticsScroll} showsVerticalScrollIndicator={false}>
          <Card style={styles.statisticsFilterCard}>
            <Text style={styles.statisticsFilterTitle}>Filtri</Text>
            <View style={styles.twoColumns}>
              <View style={styles.flexField}><AppInput label="Dal" value={filters.fromDate ?? ''} onChangeText={(value) => setFilters((current) => ({ ...current, fromDate: value || undefined }))} placeholder="GG/MM/AAAA" /></View>
              <View style={styles.flexField}><AppInput label="Al" value={filters.toDate ?? ''} onChangeText={(value) => setFilters((current) => ({ ...current, toDate: value || undefined }))} placeholder="GG/MM/AAAA" /></View>
            </View>
            <ChoiceRow label="Sede" value={selectedSite?.shortName ?? 'Tutte le sedi'} onPress={() => setPicker('site')} />
            <ChoiceRow label="Asset" value={selectedEquipment?.name ?? 'Tutti gli asset'} onPress={() => setPicker('equipment')} />
            <ChoiceRow label="Mover" value={selectedMover?.fullName ?? 'Tutti i Mover'} onPress={() => setPicker('mover')} />

            <Text style={styles.fieldStandaloneLabel}>Stato</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statisticsChips}>
              <FilterChip label="Tutti" active={!filters.status} onPress={() => setFilters((current) => ({ ...current, status: undefined }))} />
              {visibleStatusFilters.map((status) => (
                <FilterChip key={status} label={statusLabels[status]} active={filters.status === status} onPress={() => setFilters((current) => ({ ...current, status }))} />
              ))}
            </ScrollView>

            <Text style={styles.fieldStandaloneLabel}>Priorità</Text>
            <View style={styles.statisticsChips}>
              <FilterChip label="Tutte" active={!filters.priority} onPress={() => setFilters((current) => ({ ...current, priority: undefined }))} />
              <FilterChip label="Normale" active={filters.priority === 'normal'} onPress={() => setFilters((current) => ({ ...current, priority: 'normal' }))} />
              <FilterChip label="Urgente" active={filters.priority === 'urgent'} danger onPress={() => setFilters((current) => ({ ...current, priority: 'urgent' }))} />
            </View>
            <AppButton label={loading ? 'Elaborazione…' : 'Applica filtri'} icon="options-outline" disabled={loading} onPress={() => void load()} />
          </Card>

          {error ? <Text style={styles.statisticsError}>{error}</Text> : null}
          {data ? (
            <>
              <View style={styles.adminMetrics}>
                <AdminMetric icon="swap-horizontal-outline" value={data.total} label="Consegne" tone="brand" />
                <AdminMetric icon="checkmark-done-outline" value={data.completed} label="Completate" tone="success" />
                <AdminMetric icon="pulse-outline" value={data.active} label="In corso" tone="brand" />
                <AdminMetric icon="alert-circle-outline" value={data.urgent} label="Urgenti" tone="danger" />
                <AdminMetric icon="time-outline" value={data.late} label="In ritardo" tone="warning" />
                <Card style={styles.averageMetric}>
                  <Ionicons name="timer-outline" size={22} color={palette.violet} />
                  <Text style={styles.averageMetricValue}>{formatCycle(data.averageCycleMinutes)}</Text>
                  <Text style={styles.averageMetricLabel}>Tempo medio</Text>
                </Card>
              </View>
              <BreakdownSection title="Consegne per sede" items={data.bySite} />
              <BreakdownSection title="Consegne per asset" items={data.byEquipment} />
              <BreakdownSection title="Attività per Mover" items={data.byMover} />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <OptionModal
        visible={picker !== null}
        title={picker === 'site' ? 'Filtra per sede' : picker === 'equipment' ? 'Filtra per asset' : 'Filtra per Mover'}
        options={pickerOptions}
        selectedId={picker === 'site' ? filters.siteId ?? 'all' : picker === 'equipment' ? filters.equipmentId ?? 'all' : filters.moverId ?? 'all'}
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          const value = id === 'all' ? undefined : id;
          if (picker === 'site') setFilters((current) => ({ ...current, siteId: value }));
          if (picker === 'equipment') setFilters((current) => ({ ...current, equipmentId: value }));
          if (picker === 'mover') setFilters((current) => ({ ...current, moverId: value }));
          setPicker(null);
        }}
      />
    </Modal>
  );
}

function FilterChip({ label, active, danger, onPress }: { label: string; active: boolean; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && (danger ? styles.filterChipDanger : styles.filterChipActive)]}>
      <Text style={[styles.filterChipText, active && (danger ? styles.filterChipTextDanger : styles.filterChipTextActive)]}>{label}</Text>
    </Pressable>
  );
}

function BreakdownSection({ title, items }: { title: string; items: StatisticsBreakdownItem[] }) {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return (
    <Card style={styles.breakdownCard}>
      <Text style={styles.breakdownTitle}>{title}</Text>
      {items.length ? items.slice(0, 12).map((item) => (
        <View key={item.id || item.label} style={styles.breakdownRow}>
          <View style={styles.breakdownTopLine}>
            <Text style={styles.breakdownLabel} numberOfLines={1}>{item.label || 'Non assegnato'}</Text>
            <Text style={styles.breakdownValue}>{item.count}</Text>
          </View>
          <View style={styles.breakdownTrack}><View style={[styles.breakdownFill, { width: `${Math.max(5, item.count / maximum * 100)}%` }]} /></View>
        </View>
      )) : <Text style={styles.breakdownEmpty}>Nessun dato per i filtri selezionati.</Text>}
    </Card>
  );
}

function formatCycle(minutes: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} gg`;
}

function formatItalianInputDate(isoDate: string) {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}

function parseItalianInputDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeTimeInput(value: string): string | null {
  const match = value.trim().replace('.', ':').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function NewRequestModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { equipment, sites, currentUser, createRequest } = useAppStore();
  const initialSite = currentUser.siteId ?? sites[0]?.id ?? '';
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? '');
  const [destinationSiteId, setDestinationSiteId] = useState(initialSite);
  const [requestedDate, setRequestedDate] = useState(formatItalianInputDate(todayIso()));
  const [requestedTime, setRequestedTime] = useState('09:00');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [picker, setPicker] = useState<'equipment' | 'destination' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const selectedEquipment = equipment.find((item) => item.id === equipmentId);
  const destination = sites.find((site) => site.id === destinationSiteId);

  const closeAndReset = () => {
    setErrors({});
    onClose();
  };

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!equipmentId) nextErrors.equipment = 'Seleziona uno strumento.';
    const pickupSiteId = selectedEquipment?.currentSiteId ?? '';
    if (equipmentId && !pickupSiteId) nextErrors.equipment = 'La sede attuale dell’apparecchiatura non è configurata. Contatta un Admin.';
    const requestedDateIso = parseItalianInputDate(requestedDate);
    const normalizedTime = normalizeTimeInput(requestedTime);
    if (!requestedDateIso) nextErrors.date = 'Inserisci la data come GG/MM/AAAA.';
    if (!normalizedTime) nextErrors.time = 'Inserisci l’orario come HH:MM.';
    if (pickupSiteId && pickupSiteId === destinationSiteId) nextErrors.destination = 'La destinazione deve essere diversa dalla sede attuale dell’apparecchiatura.';
    if (note.trim().length < 3) nextErrors.note = 'Inserisci una nota operativa.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || submitting) return;

    const input: NewDeliveryRequest = {
      equipmentId,
      pickupSiteId,
      destinationSiteId,
      requestedDate: requestedDateIso!,
      requestedTime: normalizedTime!,
      priority,
      note: note.trim(),
    };
    setSubmitting(true);
    const created = await createRequest(input);
    setSubmitting(false);
    if (!created) {
      Alert.alert('Richiesta non inviata', 'Controlla la connessione e riprova.');
      return;
    }
    Alert.alert('Richiesta inviata', `${created.code} è stata registrata e condivisa con tutti gli utenti.`);
    closeAndReset();
  };

  const options = picker === 'equipment'
    ? equipment.filter((item) => item.movable && item.active).map((item) => ({ id: item.id, label: item.name, subtitle: `${item.inventoryCode} · ${sites.find((site) => site.id === item.currentSiteId)?.shortName ?? ''}`, icon: 'cube-outline' as const }))
    : sites.filter((site) => site.active).map((site) => ({ id: site.id, label: site.shortName, subtitle: site.address, icon: 'location-outline' as const }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAndReset}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={closeAndReset} style={styles.modalHeaderButton}><Ionicons name="close" size={25} color={palette.text} /></Pressable>
          <View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>Nuova richiesta</Text><Text style={styles.modalSubtitle}>Solo le informazioni necessarie</Text></View>
          <View style={styles.modalHeaderSpacer} />
        </View>
        <KeyboardAvoidingView style={styles.modalBody} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <ChoiceRow label="Apparecchiatura" value={selectedEquipment?.name ?? 'Seleziona'} onPress={() => setPicker('equipment')} />
            {errors.equipment ? <Text style={styles.formError}>{errors.equipment}</Text> : null}
            <ChoiceRow label="Destinazione" value={destination?.shortName ?? 'Seleziona'} onPress={() => setPicker('destination')} />
            {errors.destination ? <Text style={styles.formError}>{errors.destination}</Text> : null}

            <View style={styles.twoColumns}>
              <View style={styles.flexField}><AppInput label="Data consegna" value={requestedDate} onChangeText={setRequestedDate} placeholder="GG/MM/AAAA" keyboardType="numbers-and-punctuation" error={errors.date} /></View>
              <View style={styles.smallField}><AppInput label="Ora" value={requestedTime} onChangeText={setRequestedTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation" error={errors.time} /></View>
            </View>

            <View style={styles.priorityWrap}>
              <Text style={styles.fieldStandaloneLabel}>Priorità</Text>
              <View style={styles.priorityButtons}>
                <Pressable onPress={() => setPriority('normal')} style={[styles.priorityOption, priority === 'normal' && styles.priorityOptionActive]}>
                  <Ionicons name="time-outline" size={20} color={priority === 'normal' ? palette.brand : palette.textMuted} />
                  <Text style={[styles.priorityText, priority === 'normal' && styles.priorityTextActive]}>Normale</Text>
                </Pressable>
                <Pressable onPress={() => setPriority('urgent')} style={[styles.priorityOption, priority === 'urgent' && styles.priorityUrgentActive]}>
                  <Ionicons name="alert-circle-outline" size={20} color={priority === 'urgent' ? palette.danger : palette.textMuted} />
                  <Text style={[styles.priorityText, priority === 'urgent' && styles.priorityUrgentText]}>Urgente</Text>
                </Pressable>
              </View>
            </View>

            <Card style={styles.optionalCard}>
              <Text style={styles.optionalTitle}>Motivazione / Istruzioni</Text>
              <AppInput label="Nota operativa obbligatoria" value={note} onChangeText={setNote} placeholder="Piano, referente, orario, accessori o altre indicazioni utili…" multiline numberOfLines={3} style={styles.noteInput} error={errors.note} />
            </Card>

            <AppButton label={submitting ? "Invio…" : "Invia richiesta"} icon="send-outline" disabled={submitting} onPress={() => void submit()} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <OptionModal
        visible={picker !== null}
        title={picker === 'equipment' ? 'Scegli l’apparecchiatura' : 'Scegli la destinazione'}
        options={options}
        selectedId={picker === 'equipment' ? equipmentId : destinationSiteId}
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (picker === 'equipment') setEquipmentId(id);
          if (picker === 'destination') setDestinationSiteId(id);
          setPicker(null);
        }}
      />
    </Modal>
  );
}

function MoverTeamModal({ visible, request, onClose }: { visible: boolean; request?: DeliveryRequest; onClose: () => void }) {
  const { users, currentUser, takeRequest } = useAppStore();
  const movers = users.filter((user) => user.role === 'mover' && user.active);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- inizializza la squadra quando il modal viene aperto.
      setSelected(request?.assignedMoverIds.length ? request.assignedMoverIds : [currentUser.id]);
    }
  }, [currentUser.id, request, visible]);

  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const save = async () => {
    if (!request || !selected.length || saving) return;
    setSaving(true);
    const result = await takeRequest(request.id, selected);
    setSaving(false);
    if (!result.ok) return Alert.alert('Presa in carico non riuscita', result.error);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalHeaderButton}><Ionicons name="close" size={25} color={palette.text} /></Pressable>
          <View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>Chi si sta muovendo?</Text><Text style={styles.modalSubtitle}>Seleziona una o più persone</Text></View>
          <View style={styles.modalHeaderSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.teamPickerScroll}>
          <View style={styles.teamPickerIntro}><Ionicons name="people" size={28} color={palette.teal} /><Text style={styles.teamPickerIntroText}>Basta indicare chi effettua la consegna. Nessuna conferma aggiuntiva.</Text></View>
          {movers.map((mover) => {
            const active = selected.includes(mover.id);
            return (
              <Pressable key={mover.id} onPress={() => toggle(mover.id)} style={[styles.teamOption, active && styles.teamOptionActive]}>
                <View style={[styles.teamAvatar, active && styles.teamAvatarActive]}><Text style={[styles.teamAvatarText, active && styles.teamAvatarTextActive]}>{mover.fullName.slice(0, 1).toUpperCase()}</Text></View>
                <Text style={[styles.teamOptionName, active && styles.teamOptionNameActive]}>{mover.fullName}</Text>
                <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={25} color={active ? palette.teal : palette.border} />
              </Pressable>
            );
          })}
          <AppButton label={saving ? 'Salvataggio…' : selected.length > 1 ? `Partiamo in ${selected.length}` : 'Prendo in carico'} icon="navigate-outline" disabled={!selected.length || saving} onPress={() => void save()} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

interface OptionItem {
  id: string;
  label: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

function OptionModal({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: OptionItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.optionOverlay} onPress={onClose}>
        <Pressable style={styles.optionSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.optionHandle} />
          <View style={styles.optionHeader}>
            <Text style={styles.optionTitle}>{title}</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={24} color={palette.text} /></Pressable>
          </View>
          <ScrollView style={styles.optionList}>
            {options.map((option) => {
              const selected = option.id === selectedId;
              return (
                <Pressable key={option.id} onPress={() => onSelect(option.id)} style={({ pressed }) => [styles.optionRow, selected && styles.optionSelected, pressed && styles.pressed]}>
                  <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                    <Ionicons name={option.icon ?? 'ellipse-outline'} size={22} color={selected ? palette.white : palette.brand} />
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    {option.subtitle ? <Text style={styles.optionSubtitle}>{option.subtitle}</Text> : null}
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={24} color={palette.brand} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NotificationsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const {
    currentUser,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAppStore();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalHeaderButton}>
            <Ionicons name="close" size={25} color={palette.text} />
          </Pressable>
          <View style={styles.modalTitleWrap}>
            <Text style={styles.modalTitle}>Centro notifiche</Text>
            <Text style={styles.modalSubtitle}>Tutti ricevono tutti gli aggiornamenti</Text>
          </View>
          <Pressable onPress={() => void markAllNotificationsRead()} style={styles.modalHeaderButton}>
            <Ionicons name="checkmark-done-outline" size={23} color={palette.brand} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.notificationList} showsVerticalScrollIndicator={false}>
          <View style={styles.globalRuleCard}>
            <Ionicons name="radio-outline" size={22} color={palette.brand} />
            <View style={styles.globalRuleTextWrap}>
              <Text style={styles.globalRuleTitle}>Aggiornamenti globali attivi</Text>
              <Text style={styles.globalRuleText}>Richieste, stati, chat e promemoria vengono inviati a ogni utente attivo, senza esclusioni per ruolo.</Text>
            </View>
          </View>
          {notifications.length ? notifications.map((item) => {
            const read = item.readBy.includes(currentUser.id);
            return (
              <Pressable
                key={item.id}
                onPress={() => void markNotificationRead(item.id)}
                style={({ pressed }) => [styles.notificationCard, !read && styles.notificationCardUnread, pressed && styles.pressed]}>
                <View style={[styles.notificationIcon, { backgroundColor: notificationTone(item.kind).soft }]}>
                  <Ionicons name={notificationTone(item.kind).icon} size={21} color={notificationTone(item.kind).color} />
                </View>
                <View style={styles.notificationTextWrap}>
                  <View style={styles.notificationTopLine}>
                    <Text style={styles.notificationTitle}>{item.title}</Text>
                    {!read ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.notificationBody}>{item.body}</Text>
                  <Text style={styles.notificationTime}>{formatTimestamp(item.createdAt)}</Text>
                </View>
              </Pressable>
            );
          }) : (
            <EmptyState icon="notifications-off-outline" title="Nessuna notifica" text="Gli aggiornamenti operativi compariranno qui." />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function notificationTone(kind: 'request' | 'status' | 'assignment' | 'reminder' | 'chat' | 'system'): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  soft: string;
} {
  if (kind === 'chat') return { icon: 'chatbubble-ellipses-outline', color: palette.violet, soft: palette.violetSoft };
  if (kind === 'reminder') return { icon: 'alarm-outline', color: palette.warning, soft: palette.warningSoft };
  if (kind === 'assignment') return { icon: 'person-add-outline', color: palette.info, soft: palette.infoSoft };
  if (kind === 'status') return { icon: 'pulse-outline', color: palette.success, soft: palette.successSoft };
  if (kind === 'request') return { icon: 'add-circle-outline', color: palette.brand, soft: palette.brandSoft };
  return { icon: 'information-circle-outline', color: palette.textMuted, soft: palette.surfaceMuted };
}

function ChatModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const {
    currentUser,
    users,
    requests,
    chatMessages,
    sendChatMessage,
    deleteChatMessage,
    clearChatConversation,
    clearAllChats,
  } = useAppStore();
  const [text, setText] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string>();
  const [selectedUserId, setSelectedUserId] = useState<string>();
  const [conversationPickerOpen, setConversationPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (sending) return;
    setSending(true);
    const created = await sendChatMessage(text, selectedRequestId, selectedUserId);
    setSending(false);
    if (!created) {
      Alert.alert('Invio non riuscito', 'Controlla la connessione e verifica di aver eseguito la migrazione Supabase finale.');
      return;
    }
    setText('');
  };

  const selectedRequest = requests.find((item) => item.id === selectedRequestId);
  const selectedUser = users.find((item) => item.id === selectedUserId);
  const activeUsers = users.filter((item) => item.active && item.id !== currentUser.id);
  const conversationOptions = [
    { id: 'general', label: 'Chat generale', subtitle: 'Visibile a tutti gli utenti', icon: 'people-outline' as const },
    ...activeUsers.map((item) => ({ id: `user:${item.id}`, label: item.fullName, subtitle: `Chat privata · ${roleLabels[item.role]}`, icon: 'person-outline' as const })),
    ...requests
      .filter((item) => !['completed', 'cancelled'].includes(item.status))
      .slice(0, 30)
      .map((item) => ({ id: `request:${item.id}`, label: item.code, subtitle: `Consegna · ${statusLabels[item.status]}`, icon: 'swap-horizontal-outline' as const })),
  ];

  const visibleMessages = chatMessages.filter((item) => {
    if (selectedUserId) {
      return !item.requestId && (
        (item.senderId === currentUser.id && item.recipientId === selectedUserId) ||
        (item.senderId === selectedUserId && item.recipientId === currentUser.id)
      );
    }
    if (selectedRequestId) return item.requestId === selectedRequestId && !item.recipientId;
    return !item.requestId && !item.recipientId;
  });

  const conversationTitle = selectedUser ? selectedUser.fullName : selectedRequest ? selectedRequest.code : 'Chat generale';
  const conversationSubtitle = selectedUser ? 'Conversazione privata' : selectedRequest ? 'Conversazione della consegna' : 'Visibile a tutti gli utenti';

  const askConfirmation = (title: string, message: string, actionLabel: string, action: () => Promise<void>) => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false;
      if (confirmed) void action();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Annulla', style: 'cancel' },
      { text: actionLabel, style: 'destructive', onPress: () => void action() },
    ]);
  };

  const showActionMessage = (title: string, message?: string) => {
    if (!message) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const confirmClear = () => askConfirmation(
    'Svuotare la conversazione?',
    'Tutti i messaggi della conversazione selezionata verranno eliminati definitivamente.',
    'Svuota chat',
    async () => {
      const result = await clearChatConversation(selectedRequestId, selectedUserId);
      if (!result.ok) showActionMessage('Operazione non riuscita', result.error);
    },
  );

  const confirmClearAll = () => {
    const run = async () => {
      const result = await clearAllChats();
      showActionMessage(result.ok ? 'Chat eliminate' : 'Operazione non riuscita', result.ok ? result.message : result.error);
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm('Eliminare TUTTE le chat?\n\nSaranno cancellate chat generale, private e chat delle consegne.')) return;
      if (window.confirm('Conferma definitiva\n\nL’operazione non può essere annullata.')) void run();
      return;
    }

    Alert.alert('Eliminare TUTTE le chat?', 'Saranno cancellate chat generale, private e chat delle consegne.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Continua',
        style: 'destructive',
        onPress: () => Alert.alert('Conferma definitiva', 'L’operazione non può essere annullata.', [
          { text: 'No', style: 'cancel' },
          { text: 'Elimina tutte', style: 'destructive', onPress: () => void run() },
        ]),
      },
    ]);
  };

  const confirmDeleteMessage = (messageId: string) => askConfirmation(
    'Eliminare il messaggio?',
    'Il testo non sarà più visibile nella conversazione.',
    'Elimina',
    async () => {
      const result = await deleteChatMessage(messageId);
      if (!result.ok) showActionMessage('Operazione non riuscita', result.error);
    },
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.chatSafe}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalHeaderButton}>
            <Ionicons name="close" size={25} color={palette.text} />
          </Pressable>
          <View style={styles.modalTitleWrap}>
            <Text style={styles.modalTitle}>{conversationTitle}</Text>
            <Text style={styles.modalSubtitle}>{conversationSubtitle}</Text>
          </View>
          {currentUser.role === 'admin' ? (
            <Pressable onPress={confirmClear} style={styles.modalHeaderButton}><Ionicons name="trash-outline" size={22} color={palette.danger} /></Pressable>
          ) : <View style={styles.modalHeaderSpacer} />}
        </View>

        <View style={styles.chatContextWrap}>
          <Pressable onPress={() => setConversationPickerOpen(true)} style={({ pressed }) => [styles.chatContext, pressed && styles.pressed]}>
            <Ionicons name={selectedUser ? 'person-outline' : selectedRequest ? 'swap-horizontal-outline' : 'people-outline'} size={19} color={palette.brand} />
            <Text style={styles.chatContextText}>Cambia conversazione</Text>
            <Ionicons name="chevron-down" size={18} color={palette.textMuted} />
          </Pressable>
          {currentUser.role === 'admin' ? (
            <Pressable accessibilityLabel="Elimina tutte le chat" onPress={confirmClearAll} style={({ pressed }) => [styles.clearAllChatsButton, pressed && styles.pressed]}>
              <Ionicons name="trash-bin-outline" size={17} color={palette.danger} />
              <Text style={styles.clearAllChatsText}>Elimina tutte le chat</Text>
            </Pressable>
          ) : null}
        </View>

        <KeyboardAvoidingView style={styles.chatBody} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={10}>
          <ScrollView contentContainerStyle={styles.chatList} showsVerticalScrollIndicator={false}>
            {visibleMessages.length ? visibleMessages.map((message) => {
              const mine = message.senderId === currentUser.id;
              const sender = users.find((item) => item.id === message.senderId);
              const canDelete = !message.deletedAt && currentUser.role === 'admin';
              return (
                <View key={message.id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                  <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther, message.deletedAt && styles.messageBubbleDeleted]}>
                    {!mine ? <Text style={styles.messageSender}>{sender?.fullName ?? 'Utente'}</Text> : null}
                    <Text style={[styles.messageText, mine && styles.messageTextMine, message.deletedAt && styles.messageDeletedText]}>{message.deletedAt ? 'Messaggio eliminato' : message.text}</Text>
                    <View style={styles.messageFooter}>
                      <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>{formatTimestamp(message.createdAt)}</Text>
                      {canDelete ? <Pressable accessibilityLabel="Elimina messaggio" onPress={() => confirmDeleteMessage(message.id)}><Ionicons name="trash-outline" size={15} color={mine ? 'rgba(255,255,255,0.75)' : palette.textMuted} /></Pressable> : null}
                    </View>
                  </View>
                </View>
              );
            }) : <EmptyState icon="chatbubble-ellipses-outline" title="Nessun messaggio" text="Scrivi il primo aggiornamento della conversazione." />}
          </ScrollView>
          <View style={styles.chatComposer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={selectedUser ? `Scrivi a ${selectedUser.fullName}…` : 'Scrivi un aggiornamento…'}
              placeholderTextColor={palette.textMuted}
              multiline
              maxLength={1000}
              style={styles.chatInput}
            />
            <Pressable accessibilityLabel="Invia messaggio" disabled={!text.trim() || sending} onPress={() => void send()} style={({ pressed }) => [styles.chatSend, (!text.trim() || sending) && styles.chatSendDisabled, pressed && text.trim() && !sending && styles.pressed]}>
              <Ionicons name="arrow-up" size={22} color={palette.white} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <OptionModal
        visible={conversationPickerOpen}
        title="Scegli la conversazione"
        options={conversationOptions}
        selectedId={selectedUserId ? `user:${selectedUserId}` : selectedRequestId ? `request:${selectedRequestId}` : 'general'}
        onClose={() => setConversationPickerOpen(false)}
        onSelect={(id) => {
          if (id.startsWith('user:')) {
            setSelectedUserId(id.slice(5));
            setSelectedRequestId(undefined);
          } else if (id.startsWith('request:')) {
            setSelectedRequestId(id.slice(8));
            setSelectedUserId(undefined);
          } else {
            setSelectedRequestId(undefined);
            setSelectedUserId(undefined);
          }
          setConversationPickerOpen(false);
        }}
      />
    </Modal>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: palette.background },
  desktopShell: { flex: 1, minHeight: 0, flexDirection: 'row', backgroundColor: '#EDF3F5' },
  desktopSidebar: { width: 280, shadowColor: palette.brandDeep, shadowOpacity: 0.25, shadowRadius: 28, shadowOffset: { width: 9, height: 0 }, elevation: 12 },
  desktopSidebarScroll: { flex: 1 },
  desktopSidebarContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 18 },
  desktopBrandBlock: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 4 },
  desktopLogoWrap: { width: 58, height: 58, borderRadius: 18, overflow: 'hidden', backgroundColor: palette.brandDark, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', shadowColor: palette.black, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  desktopLogo: { width: '100%', height: '100%' },
  desktopBrandName: { color: palette.white, fontSize: 14, fontWeight: '900', letterSpacing: 2.25, fontFamily: typography.display },
  desktopBrandProduct: { color: palette.brandGlow, fontSize: 21, fontWeight: '900', letterSpacing: 3.1, marginTop: 2, fontFamily: typography.display },
  desktopWorkspaceBadge: { marginTop: 21, marginHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(94,220,238,0.25)', backgroundColor: 'rgba(56,181,213,0.12)', paddingHorizontal: 11, paddingVertical: 8, alignSelf: 'flex-start' },
  desktopLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#63E3B2' },
  desktopWorkspaceText: { color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, fontFamily: typography.body },
  desktopNav: { marginTop: 25, gap: 6 },
  desktopNavLabel: { color: 'rgba(255,255,255,0.38)', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 7, paddingHorizontal: 12, fontFamily: typography.body },
  desktopNavItem: { minHeight: 50, borderRadius: 16, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  desktopNavItemActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  desktopNavItemPressed: { opacity: 0.78 },
  desktopNavIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  desktopNavIconActive: { backgroundColor: palette.brandGlow },
  desktopNavText: { flex: 1, color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '700', fontFamily: typography.body },
  desktopNavTextActive: { color: palette.white, fontWeight: '900' },
  desktopUtilityNav: { marginTop: 19, gap: 6, paddingTop: 17, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' },
  desktopUtilityItem: { minHeight: 50, borderRadius: 15, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.055)' },
  desktopUtilityIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.075)' },
  desktopUtilityTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  desktopUtilityTitle: { color: palette.white, fontSize: 13, fontWeight: '900', fontFamily: typography.body },
  desktopUtilityDetail: { color: 'rgba(255,255,255,0.48)', fontSize: 9.5, fontWeight: '600', fontFamily: typography.body },
  desktopUtilityBadge: { minWidth: 23, height: 23, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.danger, borderWidth: 2, borderColor: 'rgba(4,28,44,0.8)' },
  desktopUtilityBadgeText: { color: palette.white, fontSize: 9, fontWeight: '900', fontFamily: typography.body },
  desktopAccountArea: { marginTop: 'auto', paddingTop: 16, gap: 9 },
  desktopLogoutButton: { minHeight: 46, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: 'rgba(197,55,64,0.16)', borderWidth: 1, borderColor: 'rgba(255,156,162,0.18)' },
  desktopLogoutText: { color: '#FFD8D8', fontSize: 13, fontWeight: '900', fontFamily: typography.body },
  desktopUserCard: { minHeight: 68, borderRadius: 18, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  desktopAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.brandGlow },
  desktopAvatarText: { color: palette.brandDeep, fontSize: 14, fontWeight: '900', fontFamily: typography.display },
  desktopUserText: { flex: 1, gap: 2 },
  desktopUserName: { color: palette.white, fontSize: 13, fontWeight: '900', fontFamily: typography.body },
  desktopUserRole: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700', fontFamily: typography.body },
  desktopOnlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#63E3B2' },
  desktopVersion: { color: 'rgba(255,255,255,0.38)', fontSize: 9, textAlign: 'center', marginTop: 9, fontFamily: typography.body },
  desktopMain: { flex: 1, minWidth: 0, minHeight: 0 },
  desktopTopbar: { minHeight: 96, paddingHorizontal: 36, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20, backgroundColor: 'rgba(255,255,255,0.96)', borderBottomWidth: 1, borderBottomColor: 'rgba(198,215,221,0.82)', shadowColor: palette.shadow, shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  desktopTopbarCopy: { flex: 1, minWidth: 0 },
  desktopTopbarEyebrow: { color: palette.brand, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, fontFamily: typography.display },
  desktopTopbarTitle: { color: palette.textStrong, fontSize: 26, fontWeight: '900', letterSpacing: -0.8, marginTop: 3, fontFamily: typography.display },
  desktopTopbarSubtitle: { color: palette.textMuted, fontSize: 13, marginTop: 3, fontFamily: typography.body },
  desktopTopbarActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  desktopStatusChip: { minHeight: 40, borderRadius: radius.pill, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.successSoft, borderWidth: 1, borderColor: '#C5E7D8' },
  desktopStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.success },
  desktopStatusText: { color: palette.success, fontSize: 11, fontWeight: '900', fontFamily: typography.body },
  desktopPushChip: { minHeight: 40, borderRadius: radius.pill, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1 },
  desktopPushChipReady: { backgroundColor: palette.successSoft, borderColor: '#C5E7D8' },
  desktopPushChipWarning: { backgroundColor: palette.warningSoft, borderColor: '#F1DCA5' },
  desktopPushChipText: { fontSize: 11, fontWeight: '900', fontFamily: typography.body },
  desktopActionButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, shadowColor: palette.shadow, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  desktopActionBadge: { position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: palette.surface },
  desktopActionBadgeText: { color: palette.white, fontSize: 8, fontWeight: '900' },
  desktopContent: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', backgroundColor: '#F2F6F7' },
  safeTop: { backgroundColor: palette.brandDeep },
  safeBottom: { backgroundColor: palette.background },
  header: {
    minHeight: 78,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: palette.brandDeep,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  brandMark: { width: 48, height: 48, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.brandDark },
  headerTextWrap: { flex: 1, gap: 3 },
  headerBrandLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(66,211,238,0.14)', borderWidth: 1, borderColor: 'rgba(66,211,238,0.28)' },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.brandGlow },
  liveText: { color: palette.brandGlow, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, fontFamily: typography.body },
  brandName: { color: palette.white, fontSize: 15, fontWeight: '900', letterSpacing: 1.15, fontFamily: typography.display },
  headerSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontFamily: typography.body },
  demoBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.warningSoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 6 },
  demoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.warning },
  demoText: { color: palette.warning, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  content: { flex: 1, minHeight: 0 },
  screenScroller: { flex: 1, minHeight: 0 },
  screenScroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 118, gap: spacing.lg, maxWidth: 820, width: '100%', alignSelf: 'center' },
  screenScrollDesktop: { maxWidth: '100%', alignSelf: 'stretch', paddingHorizontal: 44, paddingTop: 28, paddingBottom: 52, gap: 24 },
  screenScrollWide: { maxWidth: '100%', paddingHorizontal: 58, paddingTop: 34, gap: 28 },
  responsiveGrid: { width: '100%', gap: spacing.lg },
  responsiveGridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' },
  responsiveGridItem: { minWidth: 0 },
  pageIntro: { gap: 7, paddingTop: spacing.xs },
  pageIntroDesktop: { gap: 9, paddingTop: 2, maxWidth: 980 },
  eyebrowPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: palette.brandSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  eyebrowPillDesktop: { paddingHorizontal: 13, paddingVertical: 8, gap: 8 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.brandBright },
  eyebrow: { color: palette.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.25, fontFamily: typography.display },
  eyebrowDesktop: { fontSize: 11, letterSpacing: 1.45 },
  pageTitle: { color: palette.textStrong, fontSize: 28, fontWeight: '800', letterSpacing: -0.9, fontFamily: typography.display },
  pageTitleDesktop: { fontSize: 36, lineHeight: 43, letterSpacing: -1.25 },
  pageSubtitle: { color: palette.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 620, fontFamily: typography.body },
  pageSubtitleDesktop: { fontSize: 16, lineHeight: 24, maxWidth: 860 },
  heroAction: { minHeight: 118, borderRadius: radius.xl, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, shadowColor: palette.brandDark, shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 7 },
  heroActionIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center', shadowColor: palette.black, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  heroActionText: { flex: 1, gap: 4 },
  heroActionTitle: { color: palette.white, fontSize: 22, fontWeight: '800', fontFamily: typography.display, letterSpacing: -0.5 },
  heroActionSubtitle: { color: '#E7F3FF', fontSize: 13, lineHeight: 19, fontFamily: typography.body },
  symmetricGrid: { flexDirection: 'row', gap: spacing.md },
  quickStat: { flex: 1, minHeight: 138, borderRadius: radius.lg, backgroundColor: palette.surface, borderWidth: 1, borderColor: 'rgba(221,229,239,0.86)', padding: spacing.lg, alignItems: 'flex-start', justifyContent: 'space-between', shadowColor: palette.shadow, shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  quickStatIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  quickStatValue: { color: palette.text, fontSize: 31, fontWeight: '800', fontFamily: typography.display, letterSpacing: -0.8 },
  quickStatLabel: { color: palette.textMuted, fontSize: 13, fontWeight: '700', fontFamily: typography.body },
  lastEquipmentCard: { gap: spacing.md, borderWidth: 1, borderColor: '#CDE6DD', backgroundColor: '#F5FCF9' },
  lastEquipmentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lastEquipmentIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  lastEquipmentHeaderText: { flex: 1, gap: 2 },
  lastEquipmentEyebrow: { color: palette.brand, fontSize: 9, fontWeight: '900', letterSpacing: 1.15 },
  lastEquipmentTitle: { color: palette.textStrong, fontSize: 19, fontWeight: '900', fontFamily: typography.display },
  lastEquipmentCode: { color: palette.textMuted, fontSize: 12, fontWeight: '700' },
  lastEquipmentLocation: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.md, backgroundColor: palette.successSoft, padding: spacing.md },
  lastEquipmentLocationText: { flex: 1, gap: 2 },
  lastEquipmentLocationLabel: { color: palette.success, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  lastEquipmentLocationValue: { color: palette.textStrong, fontSize: 16, fontWeight: '900' },
  lastEquipmentMeta: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  lastEquipmentEmpty: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
  progressCard: { gap: spacing.md },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  progressValue: { color: palette.brand, fontSize: 15, fontWeight: '900' },
  progressTrack: { height: 9, borderRadius: radius.pill, backgroundColor: palette.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: palette.brand },
  taskCard: { gap: spacing.lg },
  taskHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sequenceBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  sequenceText: { color: palette.white, fontSize: 16, fontWeight: '900' },
  taskHeaderText: { flex: 1 },
  taskTime: { color: palette.brand, fontSize: 13, fontWeight: '900' },
  taskEquipment: { color: palette.text, fontSize: 20, fontWeight: '800', marginTop: 2, fontFamily: typography.display },
  routeLine: { flexDirection: 'row', gap: spacing.md, paddingLeft: spacing.sm },
  routeDots: { width: 18, alignItems: 'center', paddingVertical: 5 },
  routeDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.brand },
  routeDotEnd: { backgroundColor: palette.accent },
  routeConnector: { width: 2, flex: 1, minHeight: 45, backgroundColor: palette.border },
  routeTexts: { flex: 1, gap: spacing.xl },
  routeLabel: { color: palette.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  routePlace: { color: palette.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
  routeAddress: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  noteBox: { backgroundColor: palette.warningSoft, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  noteText: { color: palette.text, flex: 1, fontSize: 13, lineHeight: 19 },
  adminHero: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.xl, shadowColor: palette.brandDeep, shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8, overflow: 'hidden' },
  adminHeroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  adminHeroCopy: { flex: 1, gap: 5 },
  adminHeroEyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: 9, fontWeight: '900', letterSpacing: 1.35, fontFamily: typography.display },
  adminHeroTitle: { color: palette.white, fontSize: 25, fontWeight: '800', letterSpacing: -0.7, fontFamily: typography.display },
  adminHeroSubtitle: { color: 'rgba(255,255,255,0.74)', fontSize: 13, lineHeight: 19, fontFamily: typography.body },
  adminHeroPulse: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.13)', paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.pill },
  adminHeroPulseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#76F0BF' },
  adminHeroPulseText: { color: palette.white, fontSize: 9, fontWeight: '900', fontFamily: typography.body },
  adminHeroSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(5,31,48,0.24)', borderRadius: radius.lg, paddingVertical: 13, paddingHorizontal: 8 },
  adminHeroSummaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  adminHeroSummaryValue: { color: palette.white, fontSize: 21, fontWeight: '900', fontFamily: typography.display },
  adminHeroSummaryLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 9, fontWeight: '800', fontFamily: typography.body },
  adminHeroDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.18)' },
  dashboardSectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 },
  dashboardSectionEyebrow: { color: palette.brand, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, fontFamily: typography.display },
  dashboardSectionTitle: { color: palette.textStrong, fontSize: 20, fontWeight: '800', marginTop: 3, fontFamily: typography.display },
  versionChip: { backgroundColor: palette.brandDeep, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  versionChipText: { color: palette.brandGlow, fontSize: 10, fontWeight: '900', fontFamily: typography.body },
  adminMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  adminMetricsDesktop: { flexWrap: 'nowrap', gap: 18 },
  metricCard: { width: '47.8%', minHeight: 126, justifyContent: 'space-between', overflow: 'hidden', padding: 15 },
  metricCardDesktop: { width: 'auto', flex: 1, minWidth: 155, minHeight: 148, padding: 20 },
  metricIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metricTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricSignal: { width: 7, height: 7, borderRadius: 4 },
  metricBrand: { backgroundColor: palette.brandSoft },
  metricWarning: { backgroundColor: palette.warningSoft },
  metricDanger: { backgroundColor: palette.dangerSoft },
  metricSuccess: { backgroundColor: palette.successSoft },
  metricValue: { color: palette.textStrong, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  metricLabel: { color: palette.textMuted, fontSize: 12, fontWeight: '800' },
  adminRequestWrap: { gap: spacing.sm },
  segmented: { flexDirection: 'row', backgroundColor: palette.surfaceMuted, borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: palette.surface, shadowColor: palette.shadow, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  segmentText: { color: palette.textMuted, fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: palette.brand },
  requestCard: { gap: spacing.md, borderLeftWidth: 4, borderLeftColor: palette.brandBright },
  requestTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  requestTitleWrap: { flex: 1 },
  requestCode: { color: palette.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  requestTitle: { color: palette.text, fontSize: 19, fontWeight: '800', marginTop: 3, fontFamily: typography.display },
  requestMainInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateBox: { width: 82, borderRadius: radius.md, backgroundColor: palette.brandSoft, paddingVertical: spacing.sm, alignItems: 'center', gap: 2 },
  dateBoxText: { color: palette.text, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  dateBoxTime: { color: palette.brand, fontSize: 16, fontWeight: '900' },
  requestRouteText: { flex: 1, gap: 4 },
  requestRoute: { color: palette.text, fontSize: 15, fontWeight: '800' },
  requestMeta: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
  urgentIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  requestNote: { color: palette.textMuted, fontSize: 13, lineHeight: 18, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border },
  equipmentCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  equipmentCardInactive: { opacity: 0.64 },
  equipmentIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  equipmentText: { flex: 1, gap: 3 },
  equipmentRight: { alignItems: 'flex-end', gap: spacing.sm, maxWidth: 170 },
  equipmentEdit: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: '#BEDDFC', backgroundColor: palette.brandMist, alignItems: 'center', justifyContent: 'center' },
  equipmentName: { color: palette.text, fontSize: 16, fontWeight: '900' },
  equipmentCode: { color: palette.textMuted, fontSize: 12 },
  locationLine: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  locationText: { color: palette.textMuted, fontSize: 12, fontWeight: '700' },
  availabilityBadge: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 6 },
  availabilityFree: { backgroundColor: palette.successSoft },
  availabilityOff: { backgroundColor: palette.dangerSoft },
  availabilityBusy: { backgroundColor: palette.warningSoft },
  availabilityText: { color: palette.text, fontSize: 10, fontWeight: '900' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  profileAvatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { color: palette.white, fontSize: 20, fontWeight: '900' },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { color: palette.text, fontSize: 20, fontWeight: '800', fontFamily: typography.display },
  profileRole: { color: palette.brand, fontSize: 13, fontWeight: '800' },
  managementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  managementIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  managementText: { flex: 1, gap: 2 },
  managementTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  managementSubtitle: { color: palette.textMuted, fontSize: 12 },
  demoPanel: { gap: spacing.md },
  demoPanelTitle: { color: palette.text, fontSize: 17, fontWeight: '900' },
  demoPanelText: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
  tabBar: { minHeight: 72, flexDirection: 'row', marginHorizontal: 12, marginTop: 6, marginBottom: 7, paddingHorizontal: 7, paddingVertical: 7, borderRadius: 25, backgroundColor: palette.surface, borderWidth: 1, borderColor: 'rgba(199,215,221,0.9)', shadowColor: palette.brandDeep, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabIconWrap: { width: 46, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tabIconWrapActive: { backgroundColor: palette.brandDeep },
  tabLabel: { color: palette.textMuted, fontSize: 9, fontWeight: '800', fontFamily: typography.body },
  tabLabelActive: { color: palette.brandDark, fontWeight: '900' },
  pressed: { opacity: 0.7 },
  modalSafe: { flex: 1, minHeight: 0, width: '100%', backgroundColor: palette.background },
  modalHeader: { height: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface },
  modalHeaderButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  modalHeaderSpacer: { width: 42 },
  modalTitleWrap: { flex: 1, alignItems: 'center' },
  modalTitle: { color: palette.text, fontSize: 19, fontWeight: '800', fontFamily: typography.display },
  modalSubtitle: { color: palette.textMuted, fontSize: 11, marginTop: 2 },
  modalBody: { flex: 1 },
  formScroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: Platform.OS === 'web' ? 1280 : 650, width: '100%', alignSelf: 'center' },
  formError: { color: palette.danger, fontSize: 12, fontWeight: '600', marginTop: -10 },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  flexField: { flex: 1, minWidth: Platform.OS === 'web' ? 260 : 0 },
  smallField: { width: 112 },
  priorityWrap: { gap: spacing.sm },
  fieldStandaloneLabel: { color: palette.text, fontSize: 14, fontWeight: '800' },
  priorityButtons: { flexDirection: 'row', gap: spacing.md },
  priorityOption: { flex: 1, minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  priorityOptionActive: { borderColor: palette.brand, backgroundColor: palette.brandSoft },
  priorityUrgentActive: { borderColor: palette.danger, backgroundColor: palette.dangerSoft },
  priorityText: { color: palette.textMuted, fontSize: 14, fontWeight: '800' },
  priorityTextActive: { color: palette.brand },
  priorityUrgentText: { color: palette.danger },
  optionalCard: { gap: spacing.lg, backgroundColor: '#F9FBFC' },
  optionalTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  optionalMuted: { color: palette.textMuted, fontWeight: '600' },
  noteInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.md },
  optionOverlay: { flex: 1, backgroundColor: 'rgba(10, 24, 28, 0.38)', justifyContent: 'flex-end' },
  optionSheet: { maxHeight: '78%', backgroundColor: palette.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  optionHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: palette.border, alignSelf: 'center', marginBottom: spacing.sm },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.border },
  optionTitle: { color: palette.text, fontSize: 19, fontWeight: '800', fontFamily: typography.display },
  optionList: { paddingHorizontal: spacing.lg },
  optionRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.border },
  optionSelected: { backgroundColor: palette.brandMist },
  optionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  optionIconSelected: { backgroundColor: palette.brand },
  optionTextWrap: { flex: 1, gap: 3 },
  optionLabel: { color: palette.text, fontSize: 15, fontWeight: '800' },
  optionSubtitle: { color: palette.textMuted, fontSize: 12 },

  heroActionPressable: { borderRadius: radius.xl },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAction: { width: 42, height: 42, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
  headerActionWide: { minWidth: 70, height: 48, borderRadius: 16, paddingHorizontal: 10, backgroundColor: palette.brandMist, borderWidth: 1, borderColor: '#CFE5FA', alignItems: 'center', justifyContent: 'center', gap: 1 },
  headerActionLabel: { color: palette.brandDark, fontSize: 10, fontWeight: '900', fontFamily: typography.body },
  headerBadge: { position: 'absolute', right: -4, top: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: palette.brandDeep },
  headerBadgeText: { color: palette.white, fontSize: 9, fontWeight: '900', fontFamily: typography.body },
  missionChatButton: { minHeight: 66, borderRadius: radius.lg, borderWidth: 2, borderColor: '#B9DCF8', backgroundColor: palette.brandMist, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  missionChatIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  missionChatTitle: { color: palette.brandDark, fontSize: 16, fontWeight: '900', fontFamily: typography.display },
  missionChatSubtitle: { color: palette.textMuted, fontSize: 12, lineHeight: 17, fontFamily: typography.body },
  noteLabel: { color: palette.warning, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, fontFamily: typography.body },
  mapsPanel: { borderRadius: radius.md, backgroundColor: palette.brandMist, borderWidth: 1, borderColor: '#D7EAFD', padding: spacing.md, gap: spacing.md },
  mapsInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mapsIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  mapsTextWrap: { flex: 1, gap: 2 },
  mapsTitle: { color: palette.text, fontSize: 14, fontWeight: '800', fontFamily: typography.display },
  mapsSubtitle: { color: palette.textMuted, fontSize: 12, lineHeight: 17, fontFamily: typography.body },
  legendCard: { gap: spacing.md, backgroundColor: palette.brandDeep, borderColor: palette.brandDeep },
  legendHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendTitle: { color: palette.white, fontSize: 17, fontWeight: '800', fontFamily: typography.display },
  legendHint: { color: 'rgba(255,255,255,0.58)', fontSize: 10, fontWeight: '800', fontFamily: typography.body, textTransform: 'uppercase', letterSpacing: 0.8 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { width: '48.6%', minHeight: 70, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  legendItemDesktop: { width: '23.8%', minHeight: 82, padding: 16 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  legendTextWrap: { flex: 1, gap: 2 },
  legendLabel: { fontSize: 12, fontWeight: '900', fontFamily: typography.body },
  legendDetail: { color: palette.textMuted, fontSize: 10, lineHeight: 14, fontFamily: typography.body },
  sharedVisibilityBanner: { backgroundColor: palette.brandMist, borderWidth: 1, borderColor: '#D9EBFC', borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sharedVisibilityText: { flex: 1, color: palette.textMuted, fontSize: 12, lineHeight: 18, fontFamily: typography.body },
  requestStatusWrap: { alignItems: 'flex-end', gap: 6 },
  lateBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.dangerSoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 },
  lateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.danger },
  lateText: { color: palette.danger, fontSize: 10, fontWeight: '900', fontFamily: typography.body },
  notificationList: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md, maxWidth: Platform.OS === 'web' ? 1400 : 760, width: '100%', alignSelf: 'center' },
  globalRuleCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: palette.brandMist, borderWidth: 1, borderColor: '#D7EAFD' },
  globalRuleTextWrap: { flex: 1, gap: 3 },
  globalRuleTitle: { color: palette.brandDark, fontSize: 15, fontWeight: '800', fontFamily: typography.display },
  globalRuleText: { color: palette.textMuted, fontSize: 12, lineHeight: 18, fontFamily: typography.body },
  notificationCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, padding: spacing.lg },
  notificationCardUnread: { borderColor: '#A9D4FB', backgroundColor: palette.brandMist },
  notificationIcon: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  notificationTextWrap: { flex: 1, gap: 4 },
  notificationTopLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notificationTitle: { flex: 1, color: palette.text, fontSize: 16, fontWeight: '800', fontFamily: typography.display },
  notificationBody: { color: palette.textMuted, fontSize: 14, lineHeight: 21, fontFamily: typography.body },
  notificationTime: { color: '#66758A', fontSize: 11, fontWeight: '700', fontFamily: typography.body },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.brandBright },
  chatSafe: { flex: 1, backgroundColor: palette.background },
  chatBody: { flex: 1 },
  chatContextWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: palette.background },
  chatContext: { minHeight: 46, borderRadius: radius.pill, paddingHorizontal: spacing.lg, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, alignSelf: 'center' },
  chatContextText: { color: palette.text, fontSize: 13, fontWeight: '800', fontFamily: typography.body },
  clearAllChatsButton: { minHeight: 40, marginTop: spacing.sm, borderRadius: radius.pill, paddingHorizontal: spacing.lg, backgroundColor: palette.dangerSoft, borderWidth: 1, borderColor: '#F0C2C7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, alignSelf: 'center' },
  clearAllChatsText: { color: palette.danger, fontSize: 12, fontWeight: '900', fontFamily: typography.body },
  chatList: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm, maxWidth: Platform.OS === 'web' ? 1400 : 760, width: '100%', alignSelf: 'center' },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageBubble: { maxWidth: '82%', borderRadius: 20, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 4 },
  messageBubbleOther: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderBottomLeftRadius: 7 },
  messageBubbleMine: { backgroundColor: palette.brand, borderBottomRightRadius: 7 },
  messageSender: { color: palette.brand, fontSize: 11, fontWeight: '900', fontFamily: typography.body },
  messageText: { color: palette.text, fontSize: 15, lineHeight: 21, fontFamily: typography.body },
  messageTextMine: { color: palette.white },
  messageTime: { color: palette.textMuted, fontSize: 9, fontWeight: '700', alignSelf: 'flex-end', fontFamily: typography.body },
  messageTimeMine: { color: '#D7EAFF' },
  chatComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, paddingHorizontal: spacing.lg, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface },
  chatInput: { flex: 1, minHeight: 48, maxHeight: 112, borderRadius: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.background, color: palette.text, paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 15, fontFamily: typography.body },
  chatSend: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  chatSendDisabled: { opacity: 0.4 },
  backendWarningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: palette.warningSoft, borderColor: '#F1D59A' },
  aboutCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statisticsScroll: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg, maxWidth: Platform.OS === 'web' ? 1560 : 860, width: '100%', alignSelf: 'center' },
  statisticsFilterCard: { gap: spacing.lg },
  statisticsFilterTitle: { color: palette.text, fontSize: 19, fontWeight: '800', fontFamily: typography.display },
  statisticsChips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filterChip: { minHeight: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: palette.brandSoft, borderColor: palette.brand },
  filterChipDanger: { backgroundColor: palette.dangerSoft, borderColor: palette.danger },
  filterChipText: { color: palette.textMuted, fontSize: 12, fontWeight: '800', fontFamily: typography.body },
  filterChipTextActive: { color: palette.brand },
  filterChipTextDanger: { color: palette.danger },
  statisticsError: { color: palette.danger, fontSize: 13, fontWeight: '700', fontFamily: typography.body },
  averageMetric: { width: '48.5%', minHeight: 126, alignItems: 'center', justifyContent: 'center', gap: 7 },
  averageMetricValue: { color: palette.text, fontSize: 22, fontWeight: '900', fontFamily: typography.display },
  averageMetricLabel: { color: palette.textMuted, fontSize: 11, fontWeight: '800', fontFamily: typography.body },
  breakdownCard: { gap: spacing.md },
  breakdownTitle: { color: palette.text, fontSize: 18, fontWeight: '800', fontFamily: typography.display },
  breakdownRow: { gap: 7 },
  breakdownTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  breakdownLabel: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '700', fontFamily: typography.body },
  breakdownValue: { color: palette.brand, fontSize: 13, fontWeight: '900', fontFamily: typography.body },
  breakdownTrack: { height: 7, borderRadius: 4, backgroundColor: palette.surfaceMuted, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 4, backgroundColor: palette.brand },
  breakdownEmpty: { color: palette.textMuted, fontSize: 13, fontFamily: typography.body },
  teamSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.tealSoft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.md },
  teamSummaryText: { flex: 1, color: palette.teal, fontFamily: typography.body, fontWeight: '700', fontSize: 14 },
  teamPickerScroll: { padding: spacing.xl, gap: spacing.md, paddingBottom: 40 },
  teamPickerIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.tealSoft, borderRadius: radius.lg, padding: spacing.lg },
  teamPickerIntroText: { flex: 1, color: palette.text, fontFamily: typography.body, fontSize: 14, lineHeight: 20 },
  teamOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, padding: 14 },
  teamOptionActive: { borderColor: palette.teal, backgroundColor: palette.tealSoft },
  teamAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceMuted },
  teamAvatarActive: { backgroundColor: palette.teal },
  teamAvatarText: { color: palette.textMuted, fontFamily: typography.display, fontWeight: '800', fontSize: 17 },
  teamAvatarTextActive: { color: palette.white },
  teamOptionName: { flex: 1, color: palette.text, fontFamily: typography.body, fontWeight: '700', fontSize: 16 },
  teamOptionNameActive: { color: palette.teal },

  headerLogoImage: { width: '100%', height: '100%', borderRadius: 14 },
  deleteClosedButton: { minHeight: 42, borderRadius: radius.md, backgroundColor: palette.dangerSoft, borderWidth: 1, borderColor: '#F4C7C7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 2 },
  deleteClosedText: { color: palette.danger, fontSize: 12, fontWeight: '800', fontFamily: typography.body },
  simpleModalScroll: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg, maxWidth: Platform.OS === 'web' ? 1280 : 680, width: '100%', alignSelf: 'center' },
  simpleModalCard: { gap: spacing.lg },
  securityIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: palette.brandMist, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  pushStateIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  simpleModalTitle: { color: palette.text, fontSize: 20, fontWeight: '900', fontFamily: typography.display, textAlign: 'center' },
  simpleModalText: { color: palette.textMuted, fontSize: 13, lineHeight: 19, fontFamily: typography.body, textAlign: 'center' },
  successMessage: { color: palette.success, fontSize: 13, fontWeight: '800', fontFamily: typography.body, textAlign: 'center' },
  tokenPreview: { color: palette.brandDark, backgroundColor: palette.brandMist, borderRadius: radius.md, padding: spacing.md, fontSize: 11, fontWeight: '700', fontFamily: typography.body, textAlign: 'center' },
  pushMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  pushMetric: { flex: 1, minWidth: Platform.OS === 'web' ? 170 : 0, minHeight: 90, borderRadius: radius.md, backgroundColor: palette.brandMist, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pushMetricValue: { color: palette.brandDark, fontSize: 28, fontWeight: '900', fontFamily: typography.display },
  pushMetricLabel: { color: palette.textMuted, fontSize: 11, fontWeight: '800', fontFamily: typography.body },
  pushMissingTitle: { color: palette.text, fontSize: 14, fontWeight: '900', fontFamily: typography.body },
  pushMissingUser: { color: palette.textMuted, fontSize: 12, lineHeight: 18, fontFamily: typography.body },
  webPushHelpCard: { gap: spacing.sm, backgroundColor: palette.brandMist, borderColor: '#CFE5F7' },
  webPushHelpHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  webPushHelpTitle: { color: palette.textStrong, fontSize: 15, fontWeight: '900', fontFamily: typography.display },
  webPushHelpText: { color: palette.textMuted, fontSize: 13, lineHeight: 20, fontFamily: typography.body },
  messageBubbleDeleted: { opacity: 0.72 },
  messageDeletedText: { fontStyle: 'italic' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },

});
