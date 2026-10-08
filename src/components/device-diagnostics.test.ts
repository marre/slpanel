import { h } from 'vue';
import { fireEvent, screen, within } from '@testing-library/vue';
import { render } from '@/test/render';
import DeviceDiagnostics from '@/components/device-diagnostics.vue';
async function expandDetails() {
  for (const button of screen.queryAllByRole('button', {
    name: /^More .* details$/,
  })) {
    await fireEvent.click(button);
  }
}
function value(label: string) {
  return screen
    .getByText(label, {
      selector: 'dt',
    })
    .parentElement!.querySelector('dd');
}
describe('DeviceDiagnostics', () => {
  it('explains a firmware snapshot and formats ages, clock time, and flags', async () => {
    await render(
      h(DeviceDiagnostics, {
        details:
          'wifi=online ip=192.168.1.42 elapsed_ms=1500 wifi_stalled=false ntp=synced time=synced unix_ms=1790985600000 sync_age_ms=100 api_state=live api_departures=4 api_data_age_ms=45000 https=tls https_error=none http=200 scene=text render=drawing scan=dma frames=100 buttons=1,2,3 busy=7',
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'Wi-Fi connection',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Device clock',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Transit data',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Panel activity',
      }),
    ).toBeInTheDocument();
    await expandDetails();
    expect(
      await screen.findByText('Button press counts', { selector: 'dt' }),
    ).toBeInTheDocument();
    expect(value('IP address')).toHaveTextContent('192.168.1.42');
    expect(value('Time in current state')).toHaveTextContent('1.5 s');
    expect(value('Recovery exhausted')).toHaveTextContent('No');
    expect(value('Device time (UTC)')).toHaveTextContent(
      '2026-10-03T00:00:00.000Z',
    );
    expect(value('Time since clock sync')).toHaveTextContent('100 ms');
    expect(value('Age of departure data')).toHaveTextContent('45 s');
    expect(value('Service connection stage')).toHaveTextContent(
      'Establishing secure connection',
    );
    expect(value('Button press counts')).toHaveTextContent(
      'Button 0: 1 · Button 1: 2 · Button 2: 3',
    );
    expect(value('Frame submissions deferred')).toHaveTextContent('7');
    expect(
      screen.getByText(
        'Submissions rejected because the output driver was busy.',
      ),
    ).toBeInTheDocument();
  });
  it('handles partial and future snapshots without inventing missing values', async () => {
    await render(
      h(DeviceDiagnostics, {
        details:
          'wifi=waiting-settings https_error=http api_age_ms=none http=0 new_sensor=odd-value',
      }),
    );
    await expandDetails();
    expect(
      await screen.findByText('Time since successful request', {
        selector: 'dt',
      }),
    ).toBeInTheDocument();
    expect(value('Connection state')).toHaveTextContent(
      'Waiting for configuration',
    );
    expect(value('Service error')).toHaveTextContent('HTTP request failed');
    expect(value('Time since successful request')).toHaveTextContent(
      'Not available yet',
    );
    expect(value('HTTP response code')).toHaveTextContent('No response yet');
    expect(value('new_sensor')).toHaveTextContent('odd-value');
    expect(
      screen.queryByRole('heading', {
        name: 'Device clock',
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('IP address')).not.toBeInTheDocument();
  });
  it('keeps malformed values readable and falls back for unstructured firmware output', async () => {
    const view = await render(
      h(DeviceDiagnostics, {
        details:
          'unix_ms=99999999999999999999 wifi_stalled=unknown api_data_age_ms=invalid',
      }),
    );
    expect(value('Device time (UTC)')).toHaveTextContent(
      '99999999999999999999',
    );
    expect(value('Recovery exhausted')).toHaveTextContent('unknown');
    expect(value('Age of departure data')).toHaveTextContent('invalid');
    await view.rerender(
      h(DeviceDiagnostics, {
        details: 'Old firmware status text',
      }),
    );
    expect(
      within(screen.getByRole('region')).getByText(/available in the raw view/),
    ).toBeInTheDocument();
  });
});
