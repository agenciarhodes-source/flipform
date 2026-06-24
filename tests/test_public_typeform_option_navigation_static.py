from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / 'components/public-typeform.tsx'


def source() -> str:
    return COMPONENT.read_text()


def choice_renderer_block() -> str:
    content = source()
    start = content.index("case 'single_select':")
    end = content.index("case 'rating':")
    return content[start:end]


def test_single_select_option_click_only_updates_value_without_advancing():
    block = choice_renderer_block()
    assert 'type="button" role="radio"' in block
    assert 'onClick={() => onChange(opt)}' in block
    assert 'onEnter' not in block
    assert 'setStep' not in block
    assert 'setDone' not in block
    assert 'setDisqualified' not in block


def test_single_select_double_click_cannot_trigger_submit_or_advance():
    block = choice_renderer_block()
    single_line = next(line for line in block.splitlines() if 'role="radio"' in line)
    assert 'onDoubleClick={(event) => event.preventDefault()}' in single_line
    assert 'type="submit"' not in single_line


def test_switching_single_select_option_does_not_auto_advance():
    block = choice_renderer_block()
    assert 'aria-checked={value === opt}' in block
    assert 'onClick={() => onChange(opt)}' in block
    assert 'onClick={() => { onChange(opt);' not in block


def test_multi_select_click_and_uncheck_only_toggle_state_without_advancing():
    block = choice_renderer_block()
    assert 'type="button" role="checkbox"' in block
    assert 'onClick={() => onChange(checked ? arr.filter((x) => x !== opt) : [...arr, opt])}' in block
    assert 'aria-checked={checked}' in block
    assert 'onEnter' not in block


def test_option_buttons_are_not_submit_buttons_and_main_action_is_explicit_button():
    content = source()
    block = choice_renderer_block()
    assert 'type="submit"' not in block
    assert '<Button type="button" onClick={next}' in content
    assert '<Button type="button" variant="ghost" onClick={prev}' in content


def test_required_choice_validation_blocks_blue_button_without_answer():
    content = source()
    assert "'Selecione uma opção.'" in content
    assert "'Selecione pelo menos uma opção.'" in content
    assert 'if (!validate()) return;' in content


def test_qualifier_evaluation_happens_only_in_next_action_not_option_click():
    content = source()
    block = choice_renderer_block()
    next_start = content.index('const next = async () => {')
    next_end = content.index('const prev = () =>')
    next_block = content[next_start:next_end]
    assert 'evaluateQualification(current, answers[current.id])' in next_block
    assert 'evaluateQualification' not in block


def test_no_label_or_card_submit_wrapper_for_options():
    block = choice_renderer_block()
    assert '<label' not in block
    assert 'type="button"' in block
    assert 'type="submit"' not in block
