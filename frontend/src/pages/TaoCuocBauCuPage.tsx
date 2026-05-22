import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Plus,
  QrCode,
  Trash2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import {
  createElectionV1Group,
  createElectionV1RosterDraft,
  deployElectionV1RosterDraft,
  getElectionV1RosterDraft,
  type ElectionV1CreateRosterDraftRequest,
  type ElectionV1RosterDraft,
} from '../api/electionV1Api';
import QRCodeGenerator from '../components/QRCodeGenerator';
import { useWeb3 } from '../context/Web3Context';
import type { RootState } from '../store/store';
import {
  buildCreateFlowRequirements,
  createCandidateDraft,
  createPositionDraft,
  getDuplicateWalletEntries,
  getFirstInvalidRequirement,
  getInvalidCandidateWallets,
  getInvalidRosterRows,
  getInvalidWalletEntries,
  getScheduleState,
  isValidEthereumAddress,
  normalizePositions,
  parseRosterEntries,
  shortenAddress,
  splitWalletEntries,
  toDateTimeLocalValue,
  type CandidateDraft,
  type PositionDraft,
  type Requirement,
  type RosterMode,
} from '../utils/electionCreateFlow';
import {
  Button,
  Field,
  fieldControlClass,
  Panel,
  SectionCard,
  StatusBadge,
  SummaryRail,
  SummaryRow,
  Wizard,
  type Step,
} from '../components/ui/clay';

// Đợt 10 (spec 010) US3: helper trình bày tự chế đã thay bằng bộ component clay.
function getErrorMessage(error: unknown) {
  const maybeError = error as any;
  if (maybeError?.response?.data?.Error) {
    return maybeError.response.data.Error;
  }
  if (maybeError?.response?.data?.error) {
    return maybeError.response.data.error;
  }
  if (maybeError instanceof Error) {
    return maybeError.message;
  }
  return 'Có lỗi không xác định khi tạo nhóm bầu cử.';
}

// Đợt 10 (spec 010) US3: messagePanelClasses/MetricCard/RequirementList/FieldError/SummaryRow
// đã thay bằng bộ component clay (StatusBadge/Field/SummaryRail/...).
function FieldError({ message }: { message: string }) {
  return (
    <p className="mt-1.5 flex items-start gap-2 text-[12px] leading-snug text-[var(--state-danger)]">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

function buildSharedRosterInviteUrl(draft: ElectionV1RosterDraft) {
  if (draft.sharedInviteUrl) {
    return draft.sharedInviteUrl;
  }

  const origin = typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
  return `${origin}/verify-voter?groupKey=${encodeURIComponent(draft.groupKey)}`;
}

const DEFAULT_CREATE_MESSAGE = 'Sẵn sàng tạo một ballot gồm nhiều chức vụ trên Sepolia.';
const compactControlClass =
  'w-full rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[var(--clay-surface)] px-3 py-2 text-sm text-[var(--clay-text)] placeholder:text-[var(--clay-muted-soft)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--clay-primary-focus)] disabled:opacity-55';
const compactInlineControlClass =
  'min-w-[120px] flex-1 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[var(--clay-surface)] px-2.5 py-1.5 text-[13px] text-[var(--clay-text)] placeholder:text-[var(--clay-muted-soft)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--clay-primary-focus)] disabled:opacity-55';

function getPositionProgress(position: PositionDraft) {
  const namedCandidateCount = position.candidates.filter(
    (candidate) => candidate.displayName.trim().length > 0,
  ).length;
  const invalidWalletCount = position.candidates.filter((candidate) => {
    const wallet = candidate.walletAddress.trim();
    return wallet.length > 0 && !isValidEthereumAddress(wallet);
  }).length;
  const hasTitle = position.title.trim().length > 0;
  const ready = hasTitle && namedCandidateCount >= 2 && invalidWalletCount === 0;

  return { hasTitle, invalidWalletCount, namedCandidateCount, ready };
}

function getRequirementAction(requirement: Requirement | null) {
  if (!requirement) {
    return {
      label: 'Đã đủ điều kiện tạo ballot',
      detail: 'Kiểm tra lần cuối ở bước xác nhận rồi tạo ballot hoặc roster xác thực.',
    };
  }

  const copy: Record<string, { label: string; detail: string }> = {
    jwt: {
      label: 'Đăng nhập lại tài khoản quản trị',
      detail: 'Phiên đăng nhập cần hợp lệ trước khi backend nhận yêu cầu tạo ballot.',
    },
    wallet: {
      label: 'Kết nối ví MetaMask',
      detail: 'Ví này sẽ là admin wallet của các ballot được tạo trên Sepolia.',
    },
    network: {
      label: 'Chuyển MetaMask sang Sepolia',
      detail: 'Mạng ví phải là Sepolia trước khi tạo ballot bằng danh sách ví trực tiếp.',
    },
    title: {
      label: 'Nhập tên đợt bầu cử',
      detail: 'Tên giúp admin và cử tri nhận diện đúng ballot trong dashboard.',
    },
    schedule: {
      label: 'Kiểm tra lại lịch commit/reveal',
      detail: 'Commit start phải ở tương lai và thứ tự phải là start < end < reveal.',
    },
    positions: {
      label: 'Hoàn thiện chức vụ và ứng viên',
      detail: 'Cần ít nhất 1 chức vụ, mỗi chức vụ có từ 2 ứng viên có tên.',
    },
    'candidate-wallets': {
      label: 'Sửa ví ứng viên sai định dạng',
      detail: 'Ví ứng viên là tùy chọn, nhưng nếu nhập thì phải đúng dạng 0x…40 ký tự.',
    },
    'voter-wallets': {
      label: 'Thêm ví cử tri',
      detail: 'Danh sách ví trực tiếp cần ít nhất 1 ví cử tri hợp lệ.',
    },
    'voter-wallet-format': {
      label: 'Sửa địa chỉ ví cử tri',
      detail: 'Mỗi địa chỉ phải đúng dạng 0x…40 ký tự để tạo Merkle eligibility.',
    },
    'voter-wallet-duplicates': {
      label: 'Xóa ví cử tri bị trùng',
      detail: 'Một ví chỉ được xuất hiện một lần trong cùng ballot.',
    },
    roster: {
      label: 'Nhập roster cử tri',
      detail: 'Mỗi dòng roster gồm họ tên, email và mã sinh viên nếu có.',
    },
    'roster-format': {
      label: 'Sửa dòng roster thiếu tên/email',
      detail: 'Roster cần họ tên và email hợp lệ để gửi OTP xác thực.',
    },
  };

  return copy[requirement.id] ?? {
    label: requirement.label,
    detail: 'Hoàn tất mục này trước khi chuyển sang bước tạo ballot.',
  };
}

export default function TaoCuocBauCuPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    currentAccount,
    connectWallet,
    ensureNetworkAndToken,
    isNetworkConnected,
    isMetaMaskInstalled,
  } = useWeb3();
  const currentUser = useSelector((state: RootState) => state.dangNhapTaiKhoan.taiKhoan);
  const accessToken = useSelector((state: RootState) => state.dangNhapTaiKhoan.accessToken);

  const now = useMemo(() => new Date(), []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [groupKey, setGroupKey] = useState('');
  const [commitStart, setCommitStart] = useState(
    toDateTimeLocalValue(new Date(now.getTime() + 60 * 60 * 1000)),
  );
  const [commitEnd, setCommitEnd] = useState(
    toDateTimeLocalValue(new Date(now.getTime() + 25 * 60 * 60 * 1000)),
  );
  const [revealEnd, setRevealEnd] = useState(
    toDateTimeLocalValue(new Date(now.getTime() + 49 * 60 * 60 * 1000)),
  );
  const [voterMode, setVoterMode] = useState<RosterMode>('wallets');
  const [voterWalletsInput, setVoterWalletsInput] = useState('');
  const [rosterInput, setRosterInput] = useState('');
  const [positions, setPositions] = useState<PositionDraft[]>(() => [createPositionDraft(1)]);
  const [activePositionId, setActivePositionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [activeDraft, setActiveDraft] = useState<ElectionV1RosterDraft | null>(null);
  const [message, setMessage] = useState(DEFAULT_CREATE_MESSAGE);
  // Đợt 10 (spec 010) US3 — Wizard 4 bước (giữ toàn bộ state/handler bên dưới nguyên vẹn).
  const [step, setStep] = useState<'b1' | 'b2' | 'b3' | 'b4'>('b1');
  const draftKeyFromUrl = searchParams.get('draft')?.trim() ?? '';

  const parsedVoterWallets = useMemo(
    () => splitWalletEntries(voterWalletsInput),
    [voterWalletsInput],
  );
  const invalidVoterWallets = useMemo(
    () => getInvalidWalletEntries(parsedVoterWallets),
    [parsedVoterWallets],
  );
  const duplicateVoterWallets = useMemo(
    () => getDuplicateWalletEntries(parsedVoterWallets),
    [parsedVoterWallets],
  );
  const parsedRosterVoters = useMemo(() => parseRosterEntries(rosterInput), [rosterInput]);
  const invalidRosterRows = useMemo(
    () => getInvalidRosterRows(parsedRosterVoters),
    [parsedRosterVoters],
  );
  const scheduleState = useMemo(
    () => getScheduleState(commitStart, commitEnd, revealEnd),
    [commitEnd, commitStart, revealEnd],
  );
  const normalizedPositions = useMemo(() => normalizePositions(positions), [positions]);
  const invalidCandidateWallets = useMemo(
    () => getInvalidCandidateWallets(normalizedPositions),
    [normalizedPositions],
  );
  const requirements = useMemo(
    () =>
      buildCreateFlowRequirements({
        accessToken,
        currentAccount,
        isNetworkConnected,
        voterMode,
        title,
        scheduleIsValid: scheduleState.isValid,
        positions: normalizedPositions,
        invalidCandidateWalletCount: invalidCandidateWallets.length,
        voterWalletCount: parsedVoterWallets.length,
        invalidVoterWalletCount: invalidVoterWallets.length,
        duplicateVoterWalletCount: duplicateVoterWallets.length,
        rosterVoterCount: parsedRosterVoters.length,
        invalidRosterRowCount: invalidRosterRows.length,
      }),
    [
      accessToken,
      currentAccount,
      duplicateVoterWallets.length,
      invalidCandidateWallets.length,
      invalidRosterRows.length,
      invalidVoterWallets.length,
      isNetworkConnected,
      normalizedPositions,
      parsedRosterVoters.length,
      parsedVoterWallets.length,
      scheduleState.isValid,
      title,
      voterMode,
    ],
  );
  const firstInvalidRequirement = useMemo(
    () => getFirstInvalidRequirement(requirements),
    [requirements],
  );
  const isReadyToSubmit = !firstInvalidRequirement;
  const showInlineErrors = submitAttempted;
  const filledPositionCount = normalizedPositions.length;
  const filledCandidateCount = normalizedPositions.reduce(
    (total, position) => total + position.candidates.length,
    0,
  );
  const readyPositionCount = positions.filter((position) => getPositionProgress(position).ready).length;
  const voterCount =
    voterMode === 'wallets' ? parsedVoterWallets.length : parsedRosterVoters.length;
  const outstandingRequirements = requirements.filter((requirement) => !requirement.ok);
  const nextAction = getRequirementAction(firstInvalidRequirement);
  const showRailMessage =
    Boolean(message) &&
    (submitAttempted || submitting || Boolean(activeDraft) || message !== DEFAULT_CREATE_MESSAGE);
  const walletTone = currentAccount ? (isNetworkConnected ? 'success' : 'warning') : 'neutral';
  const walletLabel = currentAccount
    ? isNetworkConnected
      ? 'Ví Sepolia'
      : 'Cần Sepolia'
    : 'Chưa nối ví';
  const walletActionLabel = !isMetaMaskInstalled
    ? 'Cài MetaMask'
    : currentAccount
      ? 'Kiểm tra Sepolia'
      : 'Kết nối MetaMask';
  const nextActionIsWallet =
    firstInvalidRequirement?.id === 'wallet' || firstInvalidRequirement?.id === 'network';
  const activePosition = positions.find((position) => position.id === activePositionId) ?? positions[0];
  const activePositionIndex = Math.max(
    0,
    positions.findIndex((position) => position.id === activePosition?.id),
  );
  const activePositionProgress = activePosition
    ? getPositionProgress(activePosition)
    : { hasTitle: false, invalidWalletCount: 0, namedCandidateCount: 0, ready: false };

  useEffect(() => {
    if (!draftKeyFromUrl || !accessToken) {
      return;
    }

    if (activeDraft?.groupKey === draftKeyFromUrl) {
      return;
    }

    let active = true;

    async function loadDraft() {
      try {
        const draft = await getElectionV1RosterDraft(draftKeyFromUrl);
        if (!active) {
          return;
        }

        setActiveDraft(draft);
        setVoterMode('roster');
        setGroupKey(draft.groupKey);
        setTitle(draft.title);
        setDescription(draft.description || '');
        setCommitStart(toDateTimeLocalValue(new Date(draft.commitStart)));
        setCommitEnd(toDateTimeLocalValue(new Date(draft.commitEnd)));
        setRevealEnd(toDateTimeLocalValue(new Date(draft.revealEnd)));
        setPositions(
          draft.positions.map((position, positionIndex) => ({
            id: `${position.positionId}-${positionIndex + 1}`,
            title: position.title,
            description: position.description || '',
            candidates: position.candidates.map((candidate, candidateIndex) => ({
              id: `${position.positionId}-candidate-${candidateIndex + 1}`,
              displayName: candidate.displayName,
              walletAddress: candidate.walletAddress || '',
            })),
          })),
        );
        setMessage(`Đã nạp lại bản nháp roster xác thực ${draft.groupKey}.`);
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error));
        }
      }
    }

    void loadDraft();

    return () => {
      active = false;
    };
  }, [accessToken, activeDraft?.groupKey, draftKeyFromUrl]);

  useEffect(() => {
    if (positions.length === 0) {
      return;
    }

    if (!activePositionId || !positions.some((position) => position.id === activePositionId)) {
      setActivePositionId(positions[0].id);
    }
  }, [activePositionId, positions]);

  function focusRequirement(requirement: Requirement) {
    const targetId = requirement.targetId;
    if (!targetId) {
      return;
    }

    // Panel Wizard luôn mounted ⇒ getElementById tìm được dù bước đang ẩn.
    const target = document.getElementById(targetId);
    const ownerStep = target
      ?.closest<HTMLElement>('[data-wizard-step]')
      ?.getAttribute('data-wizard-step') as 'b1' | 'b2' | 'b3' | 'b4' | undefined;
    if (ownerStep) {
      setStep(ownerStep);
    }
    window.requestAnimationFrame(() => {
      const el = document.getElementById(targetId);
      el?.focus({ preventScroll: false });
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function updatePosition(id: string, patch: Partial<PositionDraft>) {
    setPositions((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function addPosition() {
    const nextPosition = createPositionDraft(positions.length + 1);
    setPositions((current) => [...current, nextPosition]);
    setActivePositionId(nextPosition.id);
  }

  function removePosition(id: string) {
    if (positions.length <= 1) {
      return;
    }

    const removedIndex = positions.findIndex((position) => position.id === id);
    const nextPositions = positions.filter((position) => position.id !== id);
    setPositions(nextPositions);

    if (activePositionId === id) {
      const nextActive =
        nextPositions[Math.min(Math.max(removedIndex, 0), nextPositions.length - 1)] ??
        nextPositions[0];
      setActivePositionId(nextActive?.id ?? '');
    }
  }

  function updateCandidate(
    positionId: string,
    candidateId: string,
    patch: Partial<CandidateDraft>,
  ) {
    setPositions((current) =>
      current.map((position) =>
        position.id !== positionId
          ? position
          : {
              ...position,
              candidates: position.candidates.map((candidate) =>
                candidate.id === candidateId ? { ...candidate, ...patch } : candidate,
              ),
            },
      ),
    );
  }

  function addCandidate(positionId: string) {
    setPositions((current) =>
      current.map((position) =>
        position.id !== positionId
          ? position
          : {
              ...position,
              candidates: [
                ...position.candidates,
                createCandidateDraft(position.candidates.length + 1),
              ],
            },
      ),
    );
  }

  function removeCandidate(positionId: string, candidateId: string) {
    setPositions((current) =>
      current.map((position) =>
        position.id !== positionId || position.candidates.length <= 2
          ? position
          : {
              ...position,
              candidates: position.candidates.filter((candidate) => candidate.id !== candidateId),
            },
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);

    const invalidRequirement = getFirstInvalidRequirement(requirements);
    if (invalidRequirement) {
      setMessage(`Cần hoàn tất: ${invalidRequirement.label}.`);
      focusRequirement(invalidRequirement);
      return;
    }

    setSubmitting(true);

    try {
      if (!currentAccount) {
        throw new Error('Chưa kết nối được ví MetaMask.');
      }

      if (voterMode === 'wallets') {
        if (!isMetaMaskInstalled) {
          throw new Error('Máy hiện tại chưa có MetaMask.');
        }

        const ready = await ensureNetworkAndToken();
        if (!ready) {
          throw new Error('Ví chưa ở đúng mạng Sepolia.');
        }
      }

      const basePositions = normalizedPositions.map((position) => ({
        positionId: position.positionId,
        title: position.title,
        description: position.description || null,
        candidates: position.candidates.map((candidate) => ({
          displayName: candidate.displayName,
          // Đợt 10.1: normalizePositions() gán sourceId tại runtime; type
          // intersection pre-existing chưa lộ field — assertion type-only.
          sourceId: (candidate as unknown as { sourceId: string }).sourceId,
          walletAddress: candidate.walletAddress || null,
        })),
      }));

      if (voterMode === 'wallets') {
        const response = await createElectionV1Group({
          adminWalletAddress: currentAccount,
          title: title.trim(),
          description: description.trim() || null,
          groupKey: groupKey.trim() || null,
          commitStart: new Date(commitStart).toISOString(),
          commitEnd: new Date(commitEnd).toISOString(),
          revealEnd: new Date(revealEnd).toISOString(),
          voterWalletAddresses: parsedVoterWallets,
          positions: basePositions,
        });
        const firstElectionAddress = response.created.created[0]?.address;
        setMessage(`Tạo nhóm bầu cử thành công: ${response.created.groupKey}`);
        if (firstElectionAddress) {
          navigate(
            `/app/dashboard?group=${response.created.groupKey}&election=${firstElectionAddress}`,
          );
        } else {
          navigate('/app/dashboard');
        }
      } else {
        const payload: ElectionV1CreateRosterDraftRequest = {
          adminWalletAddress: currentAccount,
          title: title.trim(),
          description: description.trim() || null,
          groupKey: groupKey.trim() || null,
          commitStart: new Date(commitStart).toISOString(),
          commitEnd: new Date(commitEnd).toISOString(),
          revealEnd: new Date(revealEnd).toISOString(),
          positions: basePositions,
          voters: parsedRosterVoters.map((voter) => ({
            fullName: voter.fullName,
            email: voter.email,
            studentCode: voter.studentCode || null,
          })),
        };
        const response = await createElectionV1RosterDraft(payload);
        setActiveDraft(response.draft);
        setMessage(
          `Đã tạo bản nháp roster xác thực ${response.draft.groupKey}. Gửi QR chung cho cử tri, sau đó deploy ballot khi đã bind ví.`,
        );
        navigate(`/app/elections/new?draft=${encodeURIComponent(response.draft.groupKey)}`, {
          replace: true,
        });
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeployVerifiedRoster() {
    if (!activeDraft) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await deployElectionV1RosterDraft(activeDraft.groupKey);
      const refreshedDraft = {
        ...activeDraft,
        status: 'deployed',
        includedVoterCount: response.created.includedVoterCount,
        deployment: {
          deployedAt: new Date().toISOString(),
          includedVoterCount: response.created.includedVoterCount,
          groupKey: response.created.groupKey,
          created: response.created.created,
        },
      };
      setActiveDraft(refreshedDraft);
      setMessage(`Đã deploy ballot từ roster đã xác thực ${response.created.groupKey}.`);
      const firstElectionAddress = response.created.created[0]?.address;
      if (firstElectionAddress) {
        navigate(
          `/app/dashboard?group=${response.created.groupKey}&election=${firstElectionAddress}`,
        );
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWalletSetup() {
    if (!isMetaMaskInstalled) {
      window.open('https://metamask.io/download/', '_blank', 'noopener,noreferrer');
      return;
    }

    if (currentAccount) {
      await ensureNetworkAndToken();
      return;
    }

    await connectWallet();
  }

  // ── Đợt 10 US3: trạng thái bước (chỉ trình bày; suy từ điều kiện inline cũ) ──
  const stepError = {
    b1: showInlineErrors && title.trim().length === 0,
    b2:
      showInlineErrors &&
      requirements.some(
        (requirement) =>
          (requirement.id === 'positions' || requirement.id === 'candidate-wallets') &&
          !requirement.ok,
      ),
    b3:
      showInlineErrors &&
      (!scheduleState.isValid ||
        (voterMode === 'wallets'
          ? parsedVoterWallets.length === 0 ||
            invalidVoterWallets.length > 0 ||
            duplicateVoterWallets.length > 0
          : parsedRosterVoters.length === 0 || invalidRosterRows.length > 0)),
    b4: false,
  };
  const stepOrder: Array<'b1' | 'b2' | 'b3' | 'b4'> = ['b1', 'b2', 'b3', 'b4'];
  const stepTitles: Record<'b1' | 'b2' | 'b3' | 'b4', string> = {
    b1: 'Thông tin',
    b2: 'Chức vụ & ứng viên',
    b3: 'Lịch & cử tri',
    b4: 'Xác nhận & triển khai',
  };
  const steps: Step[] = stepOrder.map((k) => ({
    key: k,
    title: stepTitles[k],
    status: stepError[k]
      ? 'error'
      : k === step
        ? 'current'
        : stepOrder.indexOf(k) < stepOrder.indexOf(step)
          ? 'done'
          : 'todo',
  }));
  const goto = (k: 'b1' | 'b2' | 'b3' | 'b4') => setStep(k);

  const rail = (
    <SummaryRail title="Tạo ballot">
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge tone={accessToken ? 'success' : 'warning'}>
          {accessToken ? 'Đã đăng nhập' : 'Cần đăng nhập'}
        </StatusBadge>
        <StatusBadge tone={walletTone}>{walletLabel}</StatusBadge>
      </div>

      <div className="grid gap-2">
        <SummaryRow
          label="Tài khoản"
          value={currentUser?.tenHienThi ?? currentUser?.tenDangNhap ?? 'n/a'}
        />
        <SummaryRow label="Ví tạo" value={currentAccount ? shortenAddress(currentAccount) : 'Chưa nối'} />
        <SummaryRow
          label={voterMode === 'wallets' ? 'Cấu hình ví' : 'Cấu hình roster'}
          value={`${readyPositionCount}/${positions.length} chức vụ · ${voterCount} cử tri`}
        />
      </div>

      <div className="rounded-[14px] border border-[var(--clay-border)] bg-[var(--clay-surface-soft)] p-3">
        <p className="text-[11px] font-semibold uppercase text-[var(--clay-muted)]">Cần làm tiếp</p>
        <p className="mt-1 text-[15px] font-semibold text-[var(--clay-text)]">{nextAction.label}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--clay-muted)]">{nextAction.detail}</p>
        <Button
          id="connect-wallet-button"
          type="button"
          variant={firstInvalidRequirement ? 'secondary' : 'primary'}
          size="sm"
          className="mt-3 w-full"
          onClick={() => {
            if (nextActionIsWallet) {
              void handleWalletSetup();
              return;
            }
            if (firstInvalidRequirement) {
              focusRequirement(firstInvalidRequirement);
              return;
            }
            goto('b4');
          }}
          iconRight={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
        >
          {nextActionIsWallet
            ? walletActionLabel
            : firstInvalidRequirement
              ? 'Đi tới mục cần sửa'
              : 'Tới bước xác nhận'}
        </Button>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--clay-border)] pt-3 text-[13px] font-medium text-[var(--clay-text)]">
        {outstandingRequirements.length === 0 ? (
          <CheckCircle2 className="h-4 w-4 text-[var(--state-success)]" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4 text-[var(--state-danger)]" aria-hidden="true" />
        )}
        {outstandingRequirements.length === 0
          ? 'Đã đủ điều kiện'
          : `Còn ${outstandingRequirements.length} mục cần hoàn tất`}
      </div>

      {showRailMessage && (
        <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--clay-text)]">
          <div
            className="rounded-[12px] border border-[var(--clay-border)] bg-[var(--clay-surface-soft)] px-3 py-2 text-[13px] leading-relaxed text-[var(--clay-text)]"
            aria-live="polite"
          >
            {message}
          </div>
        </div>
      )}
    </SummaryRail>
  );

  const stepNavButtons = (prev?: 'b1' | 'b2' | 'b3', next?: 'b2' | 'b3' | 'b4') => (
    <div className="mt-1 flex items-center justify-between gap-3">
      {prev ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => goto(prev)}
          iconLeft={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        >
          Quay lại
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => goto(next)}
          iconRight={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
        >
          Tiếp tục
        </Button>
      )}
    </div>
  );

  return (
    <div className="text-[var(--clay-text)]">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-1">
          <h1 className="text-[1.65rem] font-semibold tracking-[-0.015em] text-[var(--clay-text)]">
            Tạo bầu cử
          </h1>
          <p className="mt-0.5 text-sm text-[var(--clay-muted)]">
            Thiết lập thông tin, chức vụ, lịch và danh sách cử tri cho đợt bầu cử trên Sepolia.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Wizard steps={steps} current={step} onStepChange={(k) => setStep(k as typeof step)} rail={rail}>
            {/* ───────── Bước 1: Thông tin ───────── */}
            <Wizard.Panel value="b1">
              <div data-wizard-step="b1">
                <SectionCard
                  title="Thông tin đợt bầu cử"
                  description="Tên và mô tả để người dùng nhận diện ballot."
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Tên cuộc bầu cử" className="md:col-span-2">
                      <input
                        id="ballot-title"
                        name="ballot-title"
                        autoComplete="off"
                        spellCheck={false}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className={fieldControlClass}
                        placeholder="Ví dụ: Bầu cử cán bộ lớp Hàng Hải K66…"
                      />
                    </Field>
                    {showInlineErrors && title.trim().length === 0 && (
                      <div className="md:col-span-2 -mt-2">
                        <FieldError message="Nhập tên cuộc bầu cử để người dùng nhận diện ballot." />
                      </div>
                    )}
                    <Field label="Mô tả" className="md:col-span-2">
                      <textarea
                        id="ballot-description"
                        name="ballot-description"
                        autoComplete="off"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={3}
                        className={fieldControlClass}
                        placeholder="Mô tả ngắn về phạm vi và quy tắc của đợt bầu cử…"
                      />
                    </Field>
                    <Field label="Group key (tùy chọn)" className="md:col-span-2">
                      <input
                        id="group-key"
                        name="group-key"
                        autoComplete="off"
                        spellCheck={false}
                        value={groupKey}
                        onChange={(event) => setGroupKey(event.target.value)}
                        className={fieldControlClass}
                        placeholder="Để trống để backend tự sinh…"
                      />
                    </Field>
                  </div>
                  {stepNavButtons(undefined, 'b2')}
                </SectionCard>
              </div>
            </Wizard.Panel>

            {/* ───────── Bước 2: Chức vụ & ứng viên ───────── */}
            <Wizard.Panel value="b2">
              <div data-wizard-step="b2" id="positions-section" tabIndex={-1}>
                <SectionCard
                  title="Chức vụ & ứng viên"
                  actions={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={addPosition}
                      iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}
                    >
                      Thêm chức vụ
                    </Button>
                  }
                >
                  {showInlineErrors && normalizedPositions.length === 0 && (
                    <FieldError message="Thêm ít nhất 1 chức vụ có tên và từ 2 ứng viên." />
                  )}
                  {showInlineErrors && invalidCandidateWallets.length > 0 && (
                    <FieldError
                      message={`Có ${invalidCandidateWallets.length} ví ứng viên sai định dạng.`}
                    />
                  )}

                  <div className="mt-2 grid gap-3 2xl:grid-cols-[260px_minmax(0,1fr)]">
                    <div className="2xl:hidden">
                      <select
                        id="position-selector"
                        aria-label="Chọn chức vụ đang sửa"
                        value={activePosition?.id ?? ''}
                        onChange={(event) => setActivePositionId(event.target.value)}
                        className={fieldControlClass}
                      >
                        {positions.map((position, positionIndex) => {
                          const progress = getPositionProgress(position);
                          return (
                            <option key={position.id} value={position.id}>
                              {position.title.trim() || `Chức vụ ${positionIndex + 1}`} ·{' '}
                              {progress.namedCandidateCount}/2 ứng viên
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="hidden 2xl:block">
                      <div className="rounded-[16px] border border-[var(--clay-border)] bg-[var(--clay-surface-soft)] p-2">
                        <div className="flex items-center justify-between px-2 py-1">
                          <div>
                            <p className="text-[11px] font-semibold uppercase text-[var(--clay-muted)]">
                              Bộ chức vụ
                            </p>
                            <p className="text-[12px] text-[var(--clay-muted-soft)]">
                              Chọn vị trí để sửa
                            </p>
                          </div>
                          <StatusBadge tone="info">{readyPositionCount}/{positions.length}</StatusBadge>
                        </div>

                        <div className="mt-2 space-y-2">
                          {positions.map((position, positionIndex) => {
                            const progress = getPositionProgress(position);
                            const isActive = activePosition?.id === position.id;
                            const statusLabel = progress.ready
                              ? 'Sẵn sàng'
                              : progress.hasTitle
                                ? `${progress.namedCandidateCount}/2`
                                : 'Cần tên';

                            return (
                              <button
                                key={position.id}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => setActivePositionId(position.id)}
                                className={`w-full rounded-[14px] border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-primary-focus)] ${
                                  isActive
                                    ? 'border-[var(--clay-primary)] bg-[var(--clay-primary-light)]'
                                    : 'border-[var(--clay-border)] bg-[var(--clay-surface)] hover:border-[var(--clay-primary)]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase text-[var(--clay-muted)]">
                                      Vị trí ElectionV1 #{positionIndex + 1}
                                    </p>
                                    <p className="mt-0.5 truncate text-[14px] font-semibold text-[var(--clay-text)]">
                                      {position.title.trim() || 'Đặt tên chức vụ'}
                                    </p>
                                  </div>
                                  <StatusBadge tone={progress.ready ? 'success' : 'warning'}>
                                    {statusLabel}
                                  </StatusBadge>
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--clay-border)]">
                                  <div
                                    className="h-full rounded-full bg-[var(--clay-primary)]"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.round((progress.namedCandidateCount / 2) * 100),
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {activePosition && (
                      <Panel padded={false} className="min-w-0 bg-[var(--clay-surface-soft)]">
                        <div className="border-b border-[var(--clay-border)] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <StatusBadge tone={activePositionProgress.ready ? 'success' : 'warning'}>
                                Vị trí #{activePositionIndex + 1}
                              </StatusBadge>
                              <span className="truncate text-sm font-semibold text-[var(--clay-text)]">
                                {activePosition.title.trim() || 'Đặt tên chức vụ'}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={positions.length <= 1}
                              aria-label={`Xóa chức vụ ${activePositionIndex + 1}`}
                              title={
                                positions.length <= 1
                                  ? 'Ballot cần ít nhất 1 chức vụ'
                                  : 'Xóa chức vụ đang chọn'
                              }
                              onClick={() => removePosition(activePosition.id)}
                              iconLeft={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                              className="h-8 w-8 px-0"
                            />
                          </div>
                        </div>

                        <div className="p-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Tên chức vụ">
                              <input
                                id={`${activePosition.id}-title`}
                                name={`${activePosition.id}-title`}
                                autoComplete="off"
                                value={activePosition.title}
                                onChange={(event) =>
                                  updatePosition(activePosition.id, { title: event.target.value })
                                }
                                className={fieldControlClass}
                                placeholder="Ví dụ: Lớp trưởng..."
                              />
                            </Field>
                            <Field label="Quy tắc thắng">
                              <input
                                id={`${activePosition.id}-description`}
                                name={`${activePosition.id}-description`}
                                autoComplete="off"
                                value={activePosition.description}
                                onChange={(event) =>
                                  updatePosition(activePosition.id, { description: event.target.value })
                                }
                                className={fieldControlClass}
                                placeholder="Ví dụ: Bầu 1 người, lấy nhiều phiếu nhất..."
                              />
                            </Field>
                          </div>

                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-semibold text-[var(--clay-text)]">
                              Thẻ ứng viên · {activePositionProgress.namedCandidateCount}/
                              {activePosition.candidates.length} có tên
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => addCandidate(activePosition.id)}
                              iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}
                            >
                              Thêm ứng viên
                            </Button>
                          </div>

                          {showInlineErrors &&
                            activePosition.title.trim().length > 0 &&
                            activePositionProgress.namedCandidateCount < 2 && (
                              <FieldError message="Mỗi chức vụ cần ít nhất 2 ứng viên có tên." />
                            )}

                          <div className="mt-2 space-y-2">
                            {activePosition.candidates.map((candidate, candidateIndex) => {
                              const candidateWallet = candidate.walletAddress.trim();
                              const candidateHasName = candidate.displayName.trim().length > 0;
                              const candidateWalletInvalid =
                                candidateWallet.length > 0 && !isValidEthereumAddress(candidateWallet);
                              const candidateReady = candidateHasName && !candidateWalletInvalid;

                              return (
                                <article
                                  key={candidate.id}
                                  className={`rounded-[14px] border bg-[var(--clay-surface)] p-2 ${
                                    candidateWalletInvalid
                                      ? 'border-[var(--state-danger)]'
                                      : candidateReady
                                        ? 'border-[var(--state-success)]'
                                        : 'border-[var(--clay-border)]'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--clay-surface-soft)] font-mono text-[13px] font-semibold text-[var(--clay-text)]">
                                      C{candidateIndex + 1}
                                    </span>
                                    <input
                                      id={`${candidate.id}-name`}
                                      name={`${candidate.id}-name`}
                                      aria-label={`Tên ứng viên ${candidateIndex + 1}`}
                                      autoComplete="off"
                                      value={candidate.displayName}
                                      onChange={(event) =>
                                        updateCandidate(activePosition.id, candidate.id, {
                                          displayName: event.target.value,
                                        })
                                      }
                                      className={compactInlineControlClass}
                                      placeholder={`Tên ứng viên ${candidateIndex + 1}`}
                                    />
                                    <input
                                      id={`${candidate.id}-wallet`}
                                      name={`${candidate.id}-wallet`}
                                      aria-label={`Ví ứng viên ${candidateIndex + 1} tùy chọn`}
                                      autoComplete="off"
                                      spellCheck={false}
                                      value={candidate.walletAddress}
                                      onChange={(event) =>
                                        updateCandidate(activePosition.id, candidate.id, {
                                          walletAddress: event.target.value,
                                        })
                                      }
                                      className={`${compactInlineControlClass} min-w-[150px] font-mono`}
                                      placeholder="Ví đại diện (tùy chọn)"
                                    />
                                    <StatusBadge
                                      tone={
                                        candidateWalletInvalid
                                          ? 'danger'
                                          : candidateReady
                                            ? 'success'
                                            : 'warning'
                                      }
                                      className="shrink-0"
                                    >
                                      {candidateWalletInvalid
                                        ? 'Sai ví'
                                        : candidateReady
                                          ? 'Sẵn sàng'
                                          : 'Thiếu tên'}
                                    </StatusBadge>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={activePosition.candidates.length <= 2}
                                      aria-label={`Xóa ứng viên ${candidateIndex + 1}`}
                                      title={
                                        activePosition.candidates.length <= 2
                                          ? 'Mỗi chức vụ cần tối thiểu 2 ứng viên'
                                          : 'Xóa ứng viên'
                                      }
                                      onClick={() => removeCandidate(activePosition.id, candidate.id)}
                                      iconLeft={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                                      className="h-8 w-8 px-0"
                                    />
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      </Panel>
                    )}
                  </div>
                  {stepNavButtons('b1', 'b3')}
                </SectionCard>
              </div>
            </Wizard.Panel>

            {/* ───────── Bước 3: Lịch & cử tri ───────── */}
            <Wizard.Panel value="b3">
              <div data-wizard-step="b3">
                <SectionCard
                  title="Lịch & danh sách cử tri"
                  description="Commit start ở tương lai và Commit start < Commit end < Reveal end."
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Commit start">
                      <input
                        id="commit-start"
                        name="commit-start"
                        type="datetime-local"
                        autoComplete="off"
                        value={commitStart}
                        onChange={(event) => setCommitStart(event.target.value)}
                        className={fieldControlClass}
                      />
                    </Field>
                    <Field label="Commit end">
                      <input
                        id="commit-end"
                        name="commit-end"
                        type="datetime-local"
                        autoComplete="off"
                        value={commitEnd}
                        onChange={(event) => setCommitEnd(event.target.value)}
                        className={fieldControlClass}
                      />
                    </Field>
                    <Field label="Reveal end">
                      <input
                        id="reveal-end"
                        name="reveal-end"
                        type="datetime-local"
                        autoComplete="off"
                        value={revealEnd}
                        onChange={(event) => setRevealEnd(event.target.value)}
                        className={fieldControlClass}
                      />
                    </Field>
                  </div>
                  {showInlineErrors && !scheduleState.isValid && (
                    <FieldError message="Lịch phải thỏa mãn Commit start ở tương lai và Commit start < Commit end < Reveal end." />
                  )}

                  <fieldset className="mt-5">
                    <legend className="mb-2 text-sm font-semibold text-[var(--clay-text)]">
                      Chế độ cử tri
                    </legend>
                    <div className="grid gap-3 md:grid-cols-2" role="group" aria-label="Chọn chế độ nhập cử tri">
                      <Button
                        type="button"
                        variant={voterMode === 'wallets' ? 'primary' : 'secondary'}
                        size="lg"
                        aria-pressed={voterMode === 'wallets'}
                        onClick={() => setVoterMode('wallets')}
                        iconLeft={<Wallet className="h-4 w-4" aria-hidden="true" />}
                      >
                        Nhập ví trực tiếp
                      </Button>
                      <Button
                        type="button"
                        variant={voterMode === 'roster' ? 'primary' : 'secondary'}
                        size="lg"
                        aria-pressed={voterMode === 'roster'}
                        onClick={() => setVoterMode('roster')}
                        iconLeft={<QrCode className="h-4 w-4" aria-hidden="true" />}
                      >
                        Roster QR / OTP
                      </Button>
                    </div>
                  </fieldset>

                  {voterMode === 'wallets' ? (
                    <div className="mt-5">
                      <Field label="Danh sách ví cử tri" hint="Mỗi dòng một địa chỉ ví.">
                        <textarea
                          id="voter-wallets-input"
                          name="voter-wallets-input"
                          autoComplete="off"
                          spellCheck={false}
                          value={voterWalletsInput}
                          onChange={(event) => setVoterWalletsInput(event.target.value)}
                          rows={3}
                          className={`${fieldControlClass} font-mono`}
                          placeholder="0x1234…abcd"
                        />
                      </Field>
                      {showInlineErrors && parsedVoterWallets.length === 0 && (
                        <FieldError message="Thêm ít nhất 1 địa chỉ ví cử tri." />
                      )}
                      {showInlineErrors && invalidVoterWallets.length > 0 && (
                        <FieldError
                          message={`Có ${invalidVoterWallets.length} địa chỉ ví cử tri sai định dạng.`}
                        />
                      )}
                      {showInlineErrors && duplicateVoterWallets.length > 0 && (
                        <FieldError
                          message={`Có ${duplicateVoterWallets.length} địa chỉ ví cử tri bị trùng.`}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="mt-5">
                      <Field
                        label="Danh sách cử tri"
                        hint="Mỗi dòng: Họ tên,email,mã sinh viên. Hệ thống tạo QR chung để cử tri tự xác thực OTP & bind ví trước khi deploy."
                      >
                        <textarea
                          id="roster-input"
                          name="roster-input"
                          autoComplete="off"
                          spellCheck={false}
                          value={rosterInput}
                          onChange={(event) => setRosterInput(event.target.value)}
                          rows={5}
                          className={fieldControlClass}
                          placeholder="Nguyễn Văn A,a@example.com,SV001"
                        />
                      </Field>
                      {showInlineErrors && parsedRosterVoters.length === 0 && (
                        <FieldError message="Thêm ít nhất 1 dòng roster." />
                      )}
                      {showInlineErrors && invalidRosterRows.length > 0 && (
                        <FieldError
                          message={`Dòng roster cần có họ tên và email hợp lệ: ${invalidRosterRows
                            .slice(0, 4)
                            .map((row) => row.rowNumber)
                            .join(', ')}${invalidRosterRows.length > 4 ? '…' : ''}.`}
                        />
                      )}
                    </div>
                  )}
                  {stepNavButtons('b2', 'b4')}
                </SectionCard>
              </div>
            </Wizard.Panel>

            {/* ───────── Bước 4: Xác nhận & triển khai ───────── */}
            <Wizard.Panel value="b4">
              <div data-wizard-step="b4" className="space-y-6">
                <SectionCard
                  title={voterMode === 'wallets' ? 'Xác nhận & tạo ballot' : 'Xác nhận & tạo roster'}
                  description={
                    voterMode === 'wallets'
                      ? 'Sau khi tạo xong, hệ thống chuyển sang bảng điều khiển và mở child election đầu tiên.'
                      : 'Chế độ roster chỉ tạo bản nháp xác thực và QR mời. Ballot on-chain chỉ deploy sau khi cử tri OTP và bind ví.'
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SummaryRow label="Ví tạo" value={currentAccount ? shortenAddress(currentAccount) : 'Chưa nối'} />
                    <SummaryRow label="Mạng ví" value={currentAccount ? (isNetworkConnected ? 'Sepolia' : 'Cần Sepolia') : 'Chưa nối ví'} />
                    <SummaryRow label="Chức vụ" value={`${filledPositionCount}/${positions.length} đã nhập`} />
                    <SummaryRow
                      label={voterMode === 'wallets' ? 'Cử tri hợp lệ' : 'Dòng roster'}
                      value={
                        voterMode === 'wallets'
                          ? parsedVoterWallets.length
                          : parsedRosterVoters.length
                      }
                    />
                  </div>
                  <div className="mt-5">
                    <Button
                      type="submit"
                      variant={isReadyToSubmit ? 'primary' : 'secondary'}
                      size="lg"
                      loading={submitting}
                      className="w-full"
                    >
                      {submitting
                        ? voterMode === 'wallets'
                          ? 'Đang deploy trên Sepolia…'
                          : 'Đang tạo roster xác thực…'
                        : !isReadyToSubmit
                          ? 'Kiểm tra điều kiện submit'
                          : voterMode === 'wallets'
                            ? 'Tạo election trên Sepolia'
                            : 'Tạo roster + QR xác thực'}
                    </Button>
                  </div>
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => goto('b3')}
                      iconLeft={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
                    >
                      Quay lại
                    </Button>
                  </div>
                </SectionCard>

                {activeDraft && voterMode === 'roster' && (
                  <>
                    <SectionCard
                      title={
                        activeDraft.status === 'deployed'
                          ? 'Ballot đã deploy on-chain'
                          : 'Bước 1/2: xác thực cử tri trước deploy'
                      }
                      description={
                        activeDraft.status === 'deployed'
                          ? 'QR onboarding đã hoàn tất. Quản lý ballot ở bảng điều khiển; không phát tiếp QR trước deploy.'
                          : 'QR chung chỉ mở luồng onboarding roster. Token riêng vẫn được backend cấp sau bước nhập email để chống nhận nhầm định danh, chống bind ví thay người khác và giữ audit trail.'
                      }
                    >
                      {activeDraft.status !== 'deployed' && (
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                          <QRCodeGenerator
                            inviteLink={buildSharedRosterInviteUrl(activeDraft)}
                            title="QR mời xác thực cử tri"
                            description="QR chỉ dùng cho bước xác thực roster trước deploy; chưa phải QR của ballot on-chain."
                            downloadFileName={`${activeDraft.groupKey}-shared-qr`}
                          />
                          <ol className="grid gap-3 text-sm text-[var(--clay-muted)] md:grid-cols-2">
                            {[
                              ['1. Tạo bản nháp roster', 'Admin nhập danh sách cử tri, lịch commit/reveal và các chức vụ.'],
                              ['2. Công bố một QR chung', 'In hoặc gửi một QR theo roster này cho toàn bộ cử tri đủ điều kiện.'],
                              ['3. Cử tri tự định danh', 'Cử tri nhập email trong roster; hệ thống chỉ gửi OTP về email đó.'],
                              ['4. Bind ví rồi deploy', 'Chỉ ví đã bind sau OTP mới được đưa vào ballot khi admin deploy.'],
                            ].map(([t, d]) => (
                              <li
                                key={t}
                                className="rounded-[14px] border border-[var(--clay-border)] bg-[var(--clay-surface)] p-4"
                              >
                                <span className="font-semibold text-[var(--clay-text)]">{t}</span>
                                <p className="mt-1 leading-6">{d}</p>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard
                      title={activeDraft.title}
                      description={`Group key: ${activeDraft.groupKey}`}
                      actions={
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => void handleDeployVerifiedRoster()}
                          disabled={
                            submitting ||
                            activeDraft.walletBoundCount === 0 ||
                            activeDraft.status === 'deployed'
                          }
                        >
                          {activeDraft.status === 'deployed'
                            ? 'Đã deploy'
                            : 'Deploy ballot từ cử tri đã xác thực'}
                        </Button>
                      }
                    >
                      <div className="mb-4">
                        <StatusBadge tone={activeDraft.status === 'deployed' ? 'success' : 'warning'}>
                          {activeDraft.status === 'deployed'
                            ? 'Đã deploy ballot on-chain'
                            : 'Chưa deploy ballot on-chain'}
                        </StatusBadge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <SummaryRow label="Tổng invite" value={String(activeDraft.totalInviteCount)} />
                        <SummaryRow label="OTP verified" value={String(activeDraft.otpVerifiedCount)} />
                        <SummaryRow label="Wallet bound" value={String(activeDraft.walletBoundCount)} />
                      </div>
                      <div className="mt-5 space-y-3">
                        {activeDraft.invites.map((invite) => (
                          <div
                            key={invite.inviteId}
                            className="grid gap-3 rounded-[14px] border border-[var(--clay-border)] bg-[var(--clay-surface)] p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold text-[var(--clay-text)]">
                                {invite.fullName}
                              </p>
                              <p className="mt-0.5 truncate text-sm text-[var(--clay-muted)]">
                                {invite.email}
                              </p>
                              {invite.studentCode && (
                                <p className="text-sm text-[var(--clay-muted)]">
                                  MSSV: {invite.studentCode}
                                </p>
                              )}
                            </div>
                            <p className="min-w-0 break-all text-xs leading-5 text-[var(--clay-muted)]">
                              {invite.inviteUrl}
                            </p>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              <StatusBadge tone={invite.otpVerified ? 'success' : 'warning'}>
                                OTP {invite.otpVerified ? 'verified' : 'pending'}
                              </StatusBadge>
                              <StatusBadge tone={invite.walletAddress ? 'success' : 'neutral'}>
                                {invite.walletAddress
                                  ? shortenAddress(invite.walletAddress)
                                  : 'Chưa bind wallet'}
                              </StatusBadge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  </>
                )}
              </div>
            </Wizard.Panel>
          </Wizard>
        </form>
      </div>
    </div>
  );
}
