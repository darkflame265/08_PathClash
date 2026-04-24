게임의 타격감 강화를 위해 말끼리 충돌하면
파티클생성이랑, Hit stop을 추가하려고해.

파티클 방향

충돌 방향을 계산해서 그 반대쪽으로 튀게 해.

const dx = defender.x - attacker.x;
const dy = defender.y - attacker.y;
const angle = Math.atan2(dy, dx);

그 다음 파티클은 angle 기준 ±60도 정도로 퍼뜨리면 됨.

공격자가 왼쪽에서 오른쪽으로 박음
→ 피격 말 오른쪽 방향으로 파티클 분사

이러면 “어디서 맞았는지”가 직관적으로 보임.

가장 강력한 건 Hit Stop

솔직히 타격감만 보면 hit stop이 1순위임.

충돌 순간 전체 애니메이션을 50~80ms 멈추고, 그 다음 이펙트를 터뜨려라.
