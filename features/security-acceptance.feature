@security
Feature: PII Leak Prevention and Security Testing
  As a security auditor
  I want to ensure that mongo-schema-fetch never exposes any PII or secrets
  Even when run with maximal verbose options (large enum threshold and high sampling)

  Scenario Outline: Fetch and verify schema security from MongoDB <version> in <config> configuration
    Given a running MongoDB "<version>" container in "<config>" configuration
    And the database is populated with PII emulation data using mongo-synth
    When I run mongo-schema-fetch with maximal security testing options
    Then the exit code should be 0
    And the output payload should not contain any PII from the verifiers list
    And the output payload should pass validation by py-secret-scan

    Examples:
      | version   | config      |
      | mongo:5.0 | standalone  |
      | mongo:6.0 | standalone  |
      | mongo:7.0 | standalone  |
      | mongo:8.0 | standalone  |
      | mongo:7.0 | auth        |

  Scenario Outline: Fetch and verify schema security from MongoDB replica set cluster
    Given a running MongoDB "<version>" replica set cluster container
    And the database is populated with PII emulation data using mongo-synth
    When I run mongo-schema-fetch with maximal security testing options
    Then the exit code should be 0
    And the output payload should not contain any PII from the verifiers list
    And the output payload should pass validation by py-secret-scan

    Examples:
      | version   |
      | mongo:6.0 |
      | mongo:7.0 |
      | mongo:8.0 |

  Scenario: Fetch and verify schema security from TLS-enabled MongoDB using TLS mutual authentication
    Given a running MongoDB container with TLS enabled
    And the database is populated with PII emulation data using mongo-synth
    When I run mongo-schema-fetch with TLS, mutual authentication, and maximal security testing options
    Then the exit code should be 0
    And the output payload should not contain any PII from the verifiers list
    And the output payload should pass validation by py-secret-scan

  Scenario: Fetch and verify schema security from TLS-enabled MongoDB using MONGODB-X509 authentication
    Given a running MongoDB container with TLS and MONGODB-X509 auth enabled
    And the database is populated with PII emulation data using mongo-synth
    When I run mongo-schema-fetch with TLS, MONGODB-X509 authentication, and maximal security testing options
    Then the exit code should be 0
    And the output payload should not contain any PII from the verifiers list
    And the output payload should pass validation by py-secret-scan
