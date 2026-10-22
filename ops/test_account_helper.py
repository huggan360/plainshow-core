import importlib.machinery
import unittest
from pathlib import Path
from unittest.mock import patch


helper = importlib.machinery.SourceFileLoader(
    'plainshow_account_helper', str(Path(__file__).with_name('account-helper.py'))
).load_module()


class AccountHelperTest(unittest.TestCase):
    def test_protected_account_cannot_be_altered(self):
        with patch.object(helper, 'protected_name', return_value='hugohansson'):
            with self.assertRaisesRegex(ValueError, 'protected'):
                helper.manage_pi('disable', 'hugohansson', '6')

    def test_protected_account_sessions_can_be_revoked(self):
        with patch.object(helper, 'revoke_agent') as revoke:
            helper.manage_pi('revoke', 'hugohansson', '6')
        revoke.assert_called_once_with('hugohansson')

    def test_existing_account_cannot_be_claimed_by_another_user(self):
        with patch.object(helper, 'owner', return_value=5), patch.object(helper, 'pi_account'):
            with self.assertRaisesRegex(ValueError, 'different PlainShow user'):
                helper.ensure_pi('alec', 15)

    def test_cloud_usernames_cannot_be_commands(self):
        with self.assertRaisesRegex(ValueError, 'Invalid Cloud account name'):
            helper.manage_cloud('delete', '--all')

    def test_group_operations_are_limited_to_managed_ids(self):
        with self.assertRaisesRegex(ValueError, 'managed Cloud group'):
            helper.manage_group('delete', 'admin')

    def test_group_removal_uses_nextcloud_group_command(self):
        with patch.object(helper, 'cloud_group_exists', return_value=True), patch.object(helper, 'cloud_exists', return_value=True), patch.object(helper, 'run') as run:
            helper.manage_group('remove', 'ps-42', 'alec')
        run.assert_called_once_with('runuser', '-u', 'www-data', '--', 'php', helper.CLOUD_OCC, 'group:removeuser', 'ps-42', 'alec')

    def test_unmanaged_linux_account_is_not_disabled(self):
        with patch.object(helper, 'protected_name', return_value='hugohansson'), patch.object(helper, 'owner', return_value=None), patch.object(helper, 'run') as run:
            helper.manage_pi('disable', 'alec', '5')
        run.assert_not_called()

    def test_project_owner_blocks_deletion(self):
        with patch.object(helper, 'PROJECT_STATE') as state:
            state.read_text.return_value = '{"projects":{"site":{"owner":"alec","members":[]}}}'
            with self.assertRaisesRegex(ValueError, 'Transfer or remove'):
                helper.assert_no_projects('alec')


if __name__ == '__main__':
    unittest.main()
