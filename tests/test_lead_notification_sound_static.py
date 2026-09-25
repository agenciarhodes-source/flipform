from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_new_lead_sound_is_enabled_by_default_and_can_be_disabled_locally():
    center = read('components/lead-notification-center.tsx')
    state = read('lib/notifications/browser-state.ts')
    assert 'const [soundEnabled, setSoundEnabled] = useState(true)' in center
    assert "const enabledSound = savedSound !== 'disabled'" in center
    assert 'Som de novo lead:' in center
    assert 'notificationSoundEnabledStorageKey' in center
    assert 'flipform:lead-notification-sound-enabled:' in state
    assert "window.localStorage.setItem(soundEnabledKey, enabled ? 'enabled' : 'disabled')" in center
    assert 'persistSoundEnabled(next)' in center

def test_sound_uses_web_audio_without_external_assets_or_network_calls():
    center = read('components/lead-notification-center.tsx')
    assert 'new window.AudioContext()' in center
    assert 'context.createOscillator()' in center
    assert 'context.createGain()' in center
    assert "oscillator.type = 'sine'" in center
    assert 'const ring = (offset: number, fundamental: number)' in center
    assert 'oscillator.frequency.setValueAtTime(fundamental * partial.ratio, start)' in center
    assert 'ring(0, 1046.5)' in center
    assert 'ring(0.42, 1318.5)' in center
    assert 'gain.connect(context.destination)' in center
    assert 'fetch(' not in center[center.index('const playLeadSound'):center.index('const showNativeNotification')]

def test_sound_fires_once_for_a_batch_of_new_leads_and_never_blocks_crm():
    center = read('components/lead-notification-center.tsx')
    assert 'void playLeadSound();' in center
    assert 'if (feed.items.length) deliverItems(feed.items)' in center
    assert 'for (const item of fresh) void showNativeNotification(item)' in center
    assert center.index('void playLeadSound();') < center.index('for (const item of fresh) void showNativeNotification(item)')
    assert 'Sound is best-effort and must never affect CRM flows.' in center

def test_sound_layer_does_not_touch_database_or_integrations():
    combined = '\n'.join([
        read('components/lead-notification-center.tsx'),
        read('lib/notifications/browser-state.ts'),
    ])
    for forbidden in [
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'metaAccessToken',
        'TenantMetaConnection',
        'PlatformMetaSettings',
        'TenantIntegrationSettings',
        'TenantWhatsAppConnection',
        'TenantInstagramConnection',
        'dispatchFormSubmissionTracking',
        'dispatchKanbanStageTracking',
        'dispatchLeadPurchaseTracking',
        'ALTER TABLE',
        'CREATE TABLE',
    ]:
        assert forbidden not in combined


def test_sound_prepares_audio_after_first_user_interaction_without_playing_immediately():
    center = read('components/lead-notification-center.tsx')
    assert "window.addEventListener('pointerdown', primeAudio, { once: true })" in center
    assert "window.addEventListener('keydown', primeAudio, { once: true })" in center
    assert "if (context.state === 'suspended') void context.resume()" in center
