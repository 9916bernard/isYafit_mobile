import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal, TextInput, SafeAreaView, Platform, KeyboardAvoidingView } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'; // Expo의 StatusBar와 이름 충돌 방지

// src/components/appSections 와 유사한 구조로 컴포넌트를 만들거나,
// 간단한 경우 App.js 내에 직접 구현합니다.
// 여기서는 개념적으로만 표현하고, 실제 구현 시에는 별도 파일로 분리하는 것이 좋습니다.

// --- 임시 컴포넌트 정의 (실제로는 src/components/appSections/* 와 유사하게 구현) ---

const Header = ({ serverAvailable, startTest, stopTest, clearLogs }) => (
  <View style={styles.header}>
    <Text style={styles.headerTitle}>IsYafit App</Text>
    <View style={styles.headerButtons}>
      <TouchableOpacity onPress={startTest} style={[styles.button, styles.startButton, !serverAvailable && styles.buttonDisabled]} disabled={!serverAvailable}>
        <Text style={styles.buttonText}>Start Test</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={stopTest} style={[styles.button, styles.stopButton, !serverAvailable && styles.buttonDisabled]} disabled={!serverAvailable}>
        <Text style={styles.buttonText}>Stop Test</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={clearLogs} style={[styles.button, styles.clearButton]}>
        <Text style={styles.buttonText}>Clear Logs</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const UserInputModal = ({ visible, userInputRequest, deviceList, userInputValue, setUserInputValue, sendUserInput, closeModal }) => {
  if (!userInputRequest) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={closeModal}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{userInputRequest.message || "사용자 입력"}</Text>
          {userInputRequest.request_type === "device_selection" && deviceList && deviceList.length > 0 && (
            <View style={styles.deviceListContainer}>
              {deviceList.map((device, index) => (
                <TouchableOpacity key={index} style={styles.deviceItem} onPress={() => sendUserInput(device.id || device.name)}>
                  <Text style={styles.deviceItemText}>{device.name} ({device.address})</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {userInputRequest.request_type !== "device_selection" && ( // 일반 텍스트 입력
            <TextInput
              style={styles.modalInput}
              value={userInputValue}
              onChangeText={setUserInputValue}
              placeholder={userInputRequest.placeholder || "값을 입력하세요..."}
              onSubmitEditing={() => sendUserInput(userInputValue)}
            />
          )}
          <TouchableOpacity style={styles.modalButton} onPress={() => {
            if (userInputRequest.request_type !== "device_selection") {
              sendUserInput(userInputValue);
            } else if (deviceList && deviceList.length === 1) { // 장치 목록이 하나면 자동 선택
              sendUserInput(deviceList[0].id || deviceList[0].name);
            }
            // 장치 선택이 여러 개이고 직접 선택하지 않은 경우, 또는 입력값이 없는 경우 모달만 닫히도록 할 수 있음
            // closeModal(); // sendUserInput 내부에서 처리하거나 여기서 호출
          }}>
            <Text style={styles.modalButtonText}>확인</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalButton, styles.modalCloseButton]} onPress={closeModal}>
            <Text style={styles.modalButtonText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};


const AppStatusBar = ({ serverAvailable, logs, userInputRequest }) => {
  const lastLog = logs.length > 0 ? logs[0] : null;
  let statusText = serverAvailable ? "서버 연결됨" : "서버 연결 안됨";
  if (userInputRequest) statusText = "사용자 입력 대기 중...";
  // else if (testInProgress) statusText = "테스트 진행 중..."; // testInProgress 상태 추가 필요

  return (
    <View style={styles.statusBar}>
      <Text style={styles.statusText}>{statusText}</Text>
      {lastLog && <Text style={styles.statusLog} numberOfLines={1}>마지막 로그: {lastLog.message}</Text>}
    </View>
  );
};

const LogArea = ({ logs, isLogsCollapsed, toggleLogsCollapse, getLogTypeColor, logContainerRef }) => (
  <View style={styles.logAreaContainer}>
    <TouchableOpacity onPress={toggleLogsCollapse} style={styles.logHeader}>
      <Text style={styles.logHeaderText}>로그 ({logs.length}) {isLogsCollapsed ? "▼" : "▲"}</Text>
    </TouchableOpacity>
    {!isLogsCollapsed && (
      <ScrollView style={styles.logScroll} ref={logContainerRef} nestedScrollEnabled={true}>
        {logs.map((log, index) => (
          <View key={index} style={[styles.logEntry, { borderColor: getLogTypeColor(log.type).borderColor || '#555' }]}>
            <Text style={[styles.logText, { color: getLogTypeColor(log.type).textColor || '#ddd' }]}>
              [{new Date(log.timestamp).toLocaleTimeString()}] [{log.type.toUpperCase()}]: {log.message}
            </Text>
          </View>
        ))}
      </ScrollView>
    )}
  </View>
);


const TestResultArea = ({ showTestResult, testResult, toggleTestResult }) => {
  if (!showTestResult || !testResult) return null;

  // src/components/TestResultView.js 와 유사한 내용을 여기에 구현
  // 예시로 간단한 정보만 표시
  return (
    <View style={styles.testResultArea}>
      <TouchableOpacity onPress={toggleTestResult} style={styles.resultHeader}>
        <Text style={styles.resultHeaderText}>테스트 결과 {showTestResult ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {showTestResult && (
        <View style={styles.resultContent}>
          <Text style={styles.resultTitle}>테스트 결과 보고서</Text>
          <Text>장치명: {testResult.device_info?.name || "N/A"}</Text>
          <Text>호환성: {testResult.compatibility_level || "N/A"}</Text>
          {/* 기타 결과 정보 표시 */}
          {testResult.reasons && testResult.reasons.length > 0 && (
            <View>
              <Text style={styles.resultSubtitle}>사유:</Text>
              {testResult.reasons.map((reason, i) => <Text key={i}>- {reason}</Text>)}
            </View>
          )}
          {testResult.reportText && (
            <View style={styles.reportTextView}>
              <Text style={styles.resultSubtitle}>상세 보고서:</Text>
              <ScrollView style={styles.reportTextScroll} nestedScrollEnabled={true}>
                <Text style={styles.reportText}>{testResult.reportText}</Text>
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// --- App 컴포넌트 ---
export default function App() {
  const [logs, setLogs] = useState([]);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [userInputRequest, setUserInputRequest] = useState(null);
  const [deviceList, setDeviceList] = useState([]);
  const [userInputValue, setUserInputValue] = useState("");
  const [isLogsCollapsed, setIsLogsCollapsed] = useState(true); // 기본값을 true로 변경하여 처음에는 접혀있도록
  const [testResult, setTestResult] = useState(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [isUserInputModalVisible, setIsUserInputModalVisible] = useState(false);

  const lastLogRef = useRef({ message: "", type: "" });
  const logContainerRef = useRef(null);

  const API_BASE_URL = "http://localhost:8000"; // 실제 백엔드 API 주소

  const pushLog = ({ message, type = "info" }) => {
    if (message === lastLogRef.current.message && type === lastLogRef.current.type) return;
    lastLogRef.current = { message, type };
    setLogs(prev => [{ message, type, timestamp: new Date() }, ...prev]);
  };

  const getLogTypeColor = (t) => { // React Native 스타일에 맞게 색상값 반환
    switch ((t || "").toLowerCase()) {
      case "error": return { textColor: "#ff6b6b", borderColor: "#c0392b" };
      case "warning": return { textColor: "#feca57", borderColor: "#f39c12" };
      case "success": return { textColor: "#1dd1a1", borderColor: "#10ac84" };
      case "info": return { textColor: "#54a0ff", borderColor: "#2980b9" };
      case "report": return { textColor: "#9b59b6", borderColor: "#8e44ad" };
      default: return { textColor: "#ecf0f1", borderColor: "#7f8c8d" };
    }
  };

  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        // const response = await fetch(`${API_BASE_URL}/status`); // REST API
        // if (response.ok) {
        //   setServerAvailable(true);
        //   pushLog({ message: "백엔드 서버에 연결되었습니다.", type: "success" });
        // } else {
        //   setServerAvailable(false);
        //   pushLog({ message: "백엔드 서버 연결 실패.", type: "error" });
        // }
        pushLog({ message: "앱 시작. (서버 상태 확인 로직 필요)", type: "info" }); // 임시 로그
        setServerAvailable(true); // 개발 편의를 위해 임시로 true 설정
      } catch (error) {
        setServerAvailable(false);
        pushLog({ message: `서버 연결 오류: ${error.message}`, type: "error" });
      }
    };
    checkServerStatus();
  }, []);

  // API 호출 함수들 (REST API 사용 가정)
  const startTest = async () => {
    if (!serverAvailable) {
      pushLog({ message: "서버 연결 안됨. 테스트 시작 불가.", type: "error" });
      return;
    }
    pushLog({ message: "테스트 시작 요청 (API 호출 필요)", type: "info" });
    setLogs([]);
    lastLogRef.current = { message: "", type: "" };
    setTestResult(null);
    setShowTestResult(false);
    setIsLogsCollapsed(false); // 로그 영역 펼치기
    // try {
    //   const response = await fetch(`${API_BASE_URL}/start-test`, { method: "POST" });
    //   const data = await response.json();
    //   if (response.ok) {
    //     pushLog({ message: data.message || "테스트 시작됨.", type: "success" });
    //     // data.userInputRequest 등으로 사용자 입력 요청 처리
    //     if (data.userInputRequest) {
    //       setUserInputRequest(data.userInputRequest);
    //       setDeviceList(data.devices || []);
    //       setIsUserInputModalVisible(true);
    //     }
    //   } else {
    //     pushLog({ message: data.error || "테스트 시작 실패.", type: "error" });
    //   }
    // } catch (e) {
    //   pushLog({ message: `테스트 시작 오류: ${e.message}`, type: "error" });
    // }
  };

  const stopTest = async () => {
    if (!serverAvailable) return;
    pushLog({ message: "테스트 중단 요청 (API 호출 필요)", type: "info" });
    // try {
    //   const response = await fetch(`${API_BASE_URL}/stop-test`, { method: "POST" });
    //   // ...
    // } catch (e) { /* ... */ }
  };

  const sendUserInputToApi = async (value) => {
    if (!serverAvailable || !userInputRequest) return;
    pushLog({ message: `사용자 입력 전송: ${value} (API 호출 필요)`, type: "info" });
    // try {
    //   const response = await fetch(`${API_BASE_URL}/user-input`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ request_type: userInputRequest.request_type, value }),
    //   });
    //   const data = await response.json();
    //   if (response.ok) {
    //     pushLog({ message: data.message || "입력 전송됨.", type: "success" });
    //     // 다음 동작 처리 (예: 새 로그, 결과 표시 등)
    //     if (data.testResult) handleTestReport(data.testResult);
    //   } else {
    //     pushLog({ message: data.error || "입력 전송 실패.", type: "error" });
    //   }
    // } catch (e) {
    //   pushLog({ message: `입력 전송 오류: ${e.message}`, type: "error" });
    // }
    setUserInputRequest(null);
    setDeviceList([]);
    setUserInputValue("");
    setIsUserInputModalVisible(false);

    // 임시: 입력 후 테스트 결과 표시 (실제로는 API 응답으로 처리)
    if (value === "ShowSampleReport") { // 특정 입력값으로 샘플 결과 표시
        handleTestReport({
            device_info: { name: "Sample Device", address: "00:11:22:33:44:55" },
            compatibility_level: "높음",
            reasons: ["샘플 데이터입니다."],
            reportText: "이것은 샘플 테스트 보고서의 상세 내용입니다. \n여러 줄로 작성될 수 있습니다."
        });
    }
  };

  const handleTestReport = (reportData) => {
    pushLog({ message: "테스트 보고서 수신 (처리 로직 필요)", type: "report" });
    setTestResult(reportData);
    setShowTestResult(true);
    setIsLogsCollapsed(true); // 결과 표시 시 로그 접기
    setTimeout(() => { // 결과 영역으로 스크롤 (React Native에서는 다른 방식 필요 가능)
        // scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const toggleTestResult = () => {
    setShowTestResult(prev => !prev);
    if (!showTestResult) setIsLogsCollapsed(true); // 결과 표시 시 로그 접기
    else setIsLogsCollapsed(false); // 결과 숨길 시 로그 펼치기
  };

  const toggleLogsCollapse = () => {
    setIsLogsCollapsed(prev => !prev);
  };

  // UserInputModal 닫기 함수
  const closeUserInputModal = () => {
    setIsUserInputModalVisible(false);
    setUserInputRequest(null); // 요청 상태도 초기화
    setDeviceList([]);
    setUserInputValue("");
  };

  // 임시: 사용자 입력 요청 발생시키는 버튼 (테스트용)
  const requestDeviceSelection = () => {
    setUserInputRequest({
      message: "테스트할 장치를 선택하세요:",
      request_type: "device_selection",
    });
    setDeviceList([
      { name: "Fitness Bike X1000", address: "AA:BB:CC:DD:EE:FF", id: "bike1" },
      { name: "Rowing Machine Pro", address: "11:22:33:44:55:66", id: "rower1" },
      { name: "Show Sample Report Trigger", address: "N/A", id: "ShowSampleReport"} // 샘플 보고서 트리거
    ]);
    setIsUserInputModalVisible(true);
  };
 const requestTextInput = () => {
    setUserInputRequest({
      message: "값을 입력해주세요:",
      request_type: "text_input",
      placeholder: "예: 시작"
    });
    setIsUserInputModalVisible(true);
  };


  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ExpoStatusBar style="light" />
        <Header
          serverAvailable={serverAvailable}
          startTest={startTest}
          stopTest={stopTest}
          clearLogs={() => { setLogs([]); lastLogRef.current = { message: "", type: "" }; }}
        />
        <AppStatusBar
          serverAvailable={serverAvailable}
          logs={logs}
          userInputRequest={userInputRequest}
        />
        {/* 임시 사용자 입력 요청 버튼들 */}
        <View style={styles.tempInputButtons}>
            <TouchableOpacity onPress={requestDeviceSelection} style={styles.tempButton}>
                <Text style={styles.buttonText}>장치 선택 요청 (임시)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={requestTextInput} style={styles.tempButton}>
                <Text style={styles.buttonText}>텍스트 입력 요청 (임시)</Text>
            </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.contentScroll}
          // ref={scrollViewRef} // 전체 스크롤 필요시
        >
          <LogArea
            logs={logs}
            isLogsCollapsed={isLogsCollapsed}
            toggleLogsCollapse={toggleLogsCollapse}
            getLogTypeColor={getLogTypeColor}
            logContainerRef={logContainerRef} // React Native에서는 ScrollView의 ref 사용 방식 다름
          />
          <TestResultArea
            showTestResult={showTestResult}
            testResult={testResult}
            toggleTestResult={toggleTestResult}
          />
        </ScrollView>
        <UserInputModal
          visible={isUserInputModalVisible}
          userInputRequest={userInputRequest}
          deviceList={deviceList}
          userInputValue={userInputValue}
          setUserInputValue={setUserInputValue}
          sendUserInput={sendUserInputToApi}
          closeModal={closeUserInputModal}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- 스타일 정의 ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#2c3e50', // 어두운 배경색
  },
  container: {
    flex: 1,
    padding: Platform.OS === 'android' ? 5 : 10, // 안드로이드 StatusBar 고려
  },
  header: {
    paddingVertical: 15,
    paddingHorizontal: 10,
    backgroundColor: '#34495e',
    borderRadius: 8,
    marginBottom: 10,
  },
  headerTitle: {
    color: '#ecf0f1',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  button: {
    backgroundColor: '#3498db',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  startButton: { backgroundColor: '#2ecc71' },
  stopButton: { backgroundColor: '#e74c3c' },
  clearButton: { backgroundColor: '#95a5a6' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  statusBar: {
    backgroundColor: '#34495e',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  statusText: {
    color: '#ecf0f1',
    fontSize: 14,
    textAlign: 'center',
  },
  statusLog: {
    color: '#bdc3c7',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 3,
  },
  logAreaContainer: {
    backgroundColor: '#34495e',
    borderRadius: 8,
    marginBottom: 10,
    maxHeight: 300, // 로그 영역 최대 높이 제한
  },
  logHeader: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2c3e50',
  },
  logHeaderText: {
    color: '#ecf0f1',
    fontWeight: 'bold',
  },
  logScroll: {
    padding: 10,
    // maxHeight: 250, // ScrollView 자체에 maxHeight 설정 가능
  },
  logEntry: {
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#2c3e50', // 로그 항목 구분선
    // borderColor는 getLogTypeColor에서 동적으로 설정
  },
  logText: {
    fontSize: 13,
    // color는 getLogTypeColor에서 동적으로 설정
  },
  testResultArea: {
    backgroundColor: '#34495e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  resultHeader: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2c3e50',
  },
  resultHeaderText: {
    color: '#ecf0f1',
    fontWeight: 'bold',
    fontSize: 16,
  },
  resultContent: {
    paddingTop: 10,
    color: '#ecf0f1',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1abc9c',
    marginBottom: 8,
  },
  resultSubtitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#e67e22',
    marginTop: 10,
    marginBottom: 4,
  },
  reportTextView: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#2c3e50',
    borderRadius: 4,
    maxHeight: 150,
  },
  reportTextScroll: {
    // flex: 1, // 필요시
  },
  reportText: {
    color: '#bdc3c7',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#34495e',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ecf0f1',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    width: '100%',
    backgroundColor: '#2c3e50',
    color: '#ecf0f1',
    padding: 10,
    borderRadius: 5,
    marginBottom: 20,
    fontSize: 16,
  },
  deviceListContainer: {
    width: '100%',
    maxHeight: 200, // 장치 목록 최대 높이
    marginBottom: 15,
  },
  deviceItem: {
    backgroundColor: '#2c3e50',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 8,
  },
  deviceItemText: {
    color: '#ecf0f1',
    fontSize: 16,
  },
  modalButton: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalCloseButton: {
    backgroundColor: '#95a5a6',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  contentScroll: {
    flex: 1, // 남은 공간을 모두 차지하도록
  },
  tempInputButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  tempButton: {
    backgroundColor: '#16a085',
    padding: 10,
    borderRadius: 5,
  }
});
